import type {
  AccountConfigSetting,
  AccountResponse,
  ActionStep,
  ExecuteActionResponse,
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
import type { ProviderConfigs, RequestInterceptor } from './config.js'
import type { PerpsProviderPlugin } from './provider.js'

/**
 * Configuration for {@link createPerpsClient}.
 *
 * @public
 */
export interface PerpsConfig {
  integrator: string
  apiKey: string
  apiUrl?: string
  disableVersionCheck?: boolean
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
  /** Integrator identifier (required) */
  integrator: string
  /** API key for authenticated requests (get one at https://portal.li.fi/) */
  apiKey: string
  /** Base API URL. Defaults to DEFAULT_API_URL */
  apiUrl?: string
  /**
   * Provider plugins or per-provider config. Accepts the same two shapes as
   * {@link PerpsConfig.providers}: an array of `PerpsProviderPlugin` plugins or
   * a keyed `ProviderConfigs` map.
   */
  providers?: PerpsProviderPlugin[] | ProviderConfigs
}

/**
 * Parameters for the internal `buildProviderSetup` helper that materialises
 * typed-data envelopes for the setup descriptors.
 *
 * @public
 */
export interface BuildProviderSetupParams {
  /** Provider to build setup actions for */
  provider: string
  /** User wallet address */
  address: Address
}

/**
 * Parameters for placing an order.
 *
 * @public
 */
export interface PlaceOrderParams {
  /** Provider to place order on */
  provider: string
  /** User wallet address */
  address: Address
  /** Market reference */
  market: MarketRef
  /** Order side */
  side: OrderSide
  /** Order type */
  type: OrderType
  /** Order size */
  size: string
  /** Order price */
  price: string
  /** Leverage */
  leverage?: number
  /** Reduce only flag */
  reduceOnly?: boolean
  /** Time in force */
  timeInForce?: TimeInForce
  /** Expiration time */
  expiresAt?: string
  /** Take profit trigger */
  takeProfit?: TriggerOrderInput
  /** Stop loss trigger */
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
  /** Provider to withdraw from */
  provider: string
  /** User wallet address (account owner) */
  address: Address
  /** Withdrawal details */
  withdrawal: WithdrawalParams
}

/**
 * Parameters for canceling orders.
 *
 * @public
 */
export interface CancelOrdersParams {
  /** Provider to cancel orders on */
  provider: string
  /** User wallet address */
  address: Address
  /** Order IDs to cancel */
  ids: string[]
}

/**
 * Parameters for modifying orders.
 *
 * @public
 */
export interface ModifyOrdersParams {
  /** Provider to modify orders on */
  provider: string
  /** User wallet address */
  address: Address
  /** Modifications to apply */
  modifications: ModifyOrderInput[]
}

/**
 * Parameters for {@link PerpsClient.checkSetup}.
 *
 * @public
 */
export interface GetSetupParams {
  /** Provider to check setup for */
  provider: string
  /** User wallet address */
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
  /** Unsatisfied setup steps, ordered by descriptor `sequence`. */
  setup: ActionStep[]
  /** Whether all setup items are already satisfied (ready to trade) */
  isReady: boolean
}

/**
 * Parameters for {@link PerpsClient.executeProviderSetup}.
 *
 * @public
 */
export interface ExecuteProviderSetupParams {
  /** Provider to satisfy setup for */
  provider: string
  /** User wallet address */
  address: Address
  /** The unsatisfied setup steps from checkSetup() */
  setup: ActionStep[]
  /** Signed counterparts of `setup`, in the same order */
  signedActions: SignedActionStep[]
}

/**
 * Result from {@link PerpsClient.executeProviderSetup}.
 *
 * @public
 */
export interface ExecuteProviderSetupResult {
  /** Results from the submitted setup steps */
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
