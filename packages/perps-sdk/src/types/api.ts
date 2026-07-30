import type {
  AccountConfigSetting,
  AccountResponse,
  ActionStep,
  ExecuteActionResponse,
  MarginMode,
  MarketRef,
  ModifyOrderInput,
  OrderSide,
  OrderType,
  SignedActionStep,
  TimeInForce,
  TriggerOrderInput,
  WithdrawalParams,
} from '@lifi/perps-types'
import type { Account, Address, WalletClient } from 'viem'
import type { RetryConfig } from '../transport/retryPolicy.js'
import type {
  ProviderConfigs,
  RequestInterceptor,
  SwitchChainHook,
} from './config.js'
import type { PerpsProviderPlugin } from './provider.js'

/**
 * Configuration for {@link createPerpsClient}.
 *
 * @public
 */
export interface PerpsConfig {
  /** Integrator identifier sent in the `x-lifi-integrator` request header. */
  integrator: string
  /** LI.FI API key used for authenticated backend requests. */
  apiKey: string
  /** Perps API base URL; defaults to {@link DEFAULT_API_URL}. */
  apiUrl?: string
  /** Skip the SDK-version compatibility check when set. */
  disableVersionCheck?: boolean
  /** Hook that can rewrite URL/request options before transport. */
  requestInterceptor?: RequestInterceptor
  /**
   * Provider plugins or per-provider config. Two shapes are accepted:
   *
   * - `PerpsProviderPlugin[]` — plugin objects implementing the read surface
   *   for one DEX each. Bound to the client at construction and looked up at
   *   runtime as bound {@link PerpsProvider}s via `client.getProvider(key)`.
   *   Modelled on `@lifi/sdk`'s `providers: SDKProvider[]`.
   * - `ProviderConfigs` — keyed config object (e.g.
   *   `{ hyperliquid: { markets: [...] } }`). Used internally by
   *   `PerpsWsClient` to filter which markets are subscribed to.
   *
   * Both may be supplied during the migration to provider packages;
   * the array form is preferred for new code.
   */
  providers?: PerpsProviderPlugin[] | ProviderConfigs
  /**
   * The end-user's wallet, used whenever an action's descriptor names the user
   * wallet in its `signers` list. Accepts any viem-compatible WalletClient:
   *   - Browser wallet: wagmi's useWalletClient() result
   *   - Private key:    createWalletClient({ account: privateKeyToAccount('0x...'), transport: http() })
   *   - Mnemonic:       createWalletClient({ account: mnemonicToAccount('word1 ...'), transport: http() })
   */
  userWallet?: WalletClient<any, any, Account>
  /**
   * Retry behaviour for HTTP requests. Pass `false` to disable retries
   * everywhere (single-shot — useful when wrapping with TanStack Query or
   * similar consumer-side retry). Pass a flat {@link RetryPolicy} to apply
   * one policy across providers, or a per-provider object keyed by provider
   * type (`'lifi'`, `'hyperliquid'`, `'lighter'`) with an optional `default`
   * fallback. Per-provider built-in defaults apply when omitted.
   */
  retry?: RetryConfig
  /**
   * Replace the global `fetch` used by the SDK and provider HTTP clients —
   * for instrumentation, custom proxying, or test injection. Does not affect
   * retry policy.
   */
  fetch?: typeof fetch
}

/**
 * Options for PerpsClient constructor.
 *
 * @public
 */
export interface PerpsClientOptions {
  /** Integrator identifier sent in the `x-lifi-integrator` request header. */
  integrator: string
  /** API key for authenticated requests (get one at https://portal.li.fi/). */
  apiKey: string
  /** Perps API base URL; defaults to {@link DEFAULT_API_URL}. */
  apiUrl?: string
  /**
   * Provider plugins or per-provider config. Accepts the same two shapes as
   * {@link PerpsConfig.providers}: an array of `PerpsProviderPlugin` plugins or
   * a keyed `ProviderConfigs` map.
   */
  providers?: PerpsProviderPlugin[] | ProviderConfigs
  /**
   * Hook invoked before a USER-signed EIP-712 action is signed, to switch the
   * user's wallet to the action's target chain. Also settable at runtime via
   * `setSwitchChain`.
   */
  switchChain?: SwitchChainHook
}

/**
 * Parameters for the internal `buildProviderSetup` helper that materialises
 * typed-data envelopes for the setup descriptors.
 *
 * @public
 */
export interface BuildProviderSetupParams {
  provider: string
  address: Address
}

/**
 * Parameters for placing an order.
 *
 * @public
 */
export interface PlaceOrderParams {
  provider: string
  address: Address
  /** Opaque provider market reference. */
  market: MarketRef
  side: OrderSide
  type: OrderType
  /** Base-asset size as a decimal wire string. */
  size: string
  /** Limit price as a decimal wire string; required by limit-style orders. */
  price: string
  /** Optional leverage multiplier; provider defaults apply when omitted. */
  leverage?: number
  /**
   * Margin mode the order trades under; omitted falls to the venue's cross
   * default. Lighter's order tx carries the mode directly; Hyperliquid
   * applies it via a prepended leverage update (requires `leverage`).
   */
  marginMode?: MarginMode
  /** Whether the order may only reduce an existing position. */
  reduceOnly?: boolean
  /** Time-in-force policy; provider defaults apply when omitted. */
  timeInForce?: TimeInForce
  /** Optional Unix timestamp or provider wire expiry string. */
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/**
 * Parameters for placing trigger-only orders (TP/SL on existing positions).
 * Sends a TRIGGER_ONLY order that skips the main order wire.
 *
 * @public
 */
export interface PlaceTriggerOrderParams {
  provider: string
  address: Address
  /** Opaque provider market reference. */
  market: MarketRef
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/**
 * Parameters for withdrawing funds.
 *
 * @public
 */
export interface WithdrawParams {
  provider: string
  address: Address
  /** Provider-specific withdrawal payload, including amount/destination. */
  withdrawal: WithdrawalParams
}

/**
 * Parameters for {@link PerpsClient.sendAsset}. The send-asset fields are held
 * flat (not nested) to avoid colliding with `@lifi/perps-types`'
 * `SendAssetParams`, which types the underlying action payload.
 *
 * @public
 */
export interface SendAssetActionParams {
  provider: string
  address: Address
  /** Canonical `Asset.id` (Hyperliquid spot uses the token index as a string); never a display symbol. */
  collateral: string
  /** Source DEX/account identifier understood by the provider. */
  sourceDex: string
  /** Destination DEX/account identifier understood by the provider. */
  destinationDex: string
  /** Transfer amount as a provider-compatible decimal wire string. */
  amount: string
}

/**
 * Parameters for canceling orders.
 *
 * @public
 */
export interface CancelOrdersParams {
  provider: string
  address: Address
  /** Venue order ids. Market-scoped venues such as Lighter also accept `"<market_id>:<order_id>"`. */
  ids: string[]
  /** Market context for per-market order ids; use the order's opaque `market.id`. */
  assetId?: string
}

/**
 * Parameters for modifying orders.
 *
 * @public
 */
export interface ModifyOrdersParams {
  provider: string
  address: Address
  /** Provider-specific order modifications. */
  modifications: ModifyOrderInput[]
}

/**
 * Parameters for {@link PerpsClient.checkSetup}.
 *
 * @public
 */
export interface GetSetupParams {
  provider: string
  address: Address
}

/**
 * Parameters for {@link PerpsClient.getDepositFlow}.
 *
 * @public
 */
export interface GetDepositFlowParams {
  provider: string
  address: Address
}

/**
 * Parameters for {@link PerpsClient.getWithdrawableBalances}.
 *
 * @public
 */
export interface GetWithdrawableBalancesParams {
  provider: string
  address: Address
}

/**
 * Result from {@link PerpsClient.checkSetup}.
 *
 * Reports the unsatisfied entries on `Provider.setup` for the queried account
 * as a flat list — each `ActionStep` is self-describing (its action keys back
 * to the provider's `setup` descriptor, which declares the step's signer and
 * scheme), so no signer-role partition is exposed here.
 *
 * `Provider.options` items are NEVER included here — they don't gate trading
 * and are surfaced separately via `getAccount().settings`.
 *
 * @public
 */
export interface ProviderSetup {
  /**
   * Whether a provider account exists at all. `false` for a brand-new address
   * whose account has not yet been funded (Hyperliquid accounts are created by
   * their first deposit). When `false`, `setup` is empty and `isReady` is
   * `false` — the consumer prompts the deposit flow before any setup steps.
   */
  accountExists: boolean
  /** Unsatisfied setup steps, ordered by descriptor `sequence`. */
  setup: ActionStep[]
  /** Whether all setup items are already satisfied (ready to trade) */
  isReady: boolean
}

/**
 * Parameters for the internal `PerpsClient.executeProviderSetup` batch submit.
 */
export interface ExecuteProviderSetupParams {
  provider: string
  address: Address
  /** The unsatisfied setup steps from checkSetup() */
  setup: ActionStep[]
  /** Signed counterparts of `setup`, in the same order */
  signedActions: SignedActionStep[]
}

/**
 * Result from the internal `PerpsClient.executeProviderSetup` batch submit.
 */
export interface ExecuteProviderSetupResult {
  results: ExecuteActionResponse
}

/**
 * Result envelope returned by {@link PerpsClient.getAccount} — wraps the
 * backend's `AccountResponse` with a single SDK-projected `settings` array.
 *
 * `settings` contains exactly one `AccountConfigSetting` per descriptor on
 * `Provider.setup` + `Provider.options` (in that order). Index the
 * projection by `setting.type === descriptor.type` and read
 * `setting.values[i].value` for each `Param` the descriptor declared.
 *
 * @public
 */
export interface GetAccountResult extends AccountResponse {
  /** SDK-projected current state of every setup + options descriptor. */
  settings: AccountConfigSetting[]
}
