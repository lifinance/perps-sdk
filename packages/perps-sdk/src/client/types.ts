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
import type { Address } from 'viem'
import type { PerpsProvider } from '../types/core.js'
import type { ProviderConfigs } from './createPerpsClient.js'

export type {
  HyperliquidConfig,
  PerpsBaseConfig,
  PerpsConfig,
  PerpsSDKClient,
  ProviderConfig,
  ProviderConfigs,
  RequestInterceptor,
  SDKRequestOptions,
} from './createPerpsClient.js'

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
   * {@link PerpsConfig.providers}: an array of `PerpsProvider` plugins or a
   * keyed `ProviderConfigs` map.
   */
  providers?: PerpsProvider[] | ProviderConfigs
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
  /** Address of the signer (auto-set in USER_AGENT mode) */
  signerAddress?: Address
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
 * Reports the unsatisfied entries on `Provider.setup` for the queried
 * account, split by the signer role the descriptor declares.
 *
 * `Provider.options` items are NEVER included here — they don't gate trading
 * and are surfaced separately via `getAccount().settings`.
 *
 * @public
 */
export interface ProviderSetup {
  /** Setup steps requiring user wallet signature */
  userProviderSetup: ActionStep[]
  /** Setup steps the SDK auto-signs with the agent */
  agentProviderSetup: ActionStep[]
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
  /** The result from checkSetup() */
  required: ProviderSetup
  /** User-signed actions corresponding to required.userProviderSetup */
  userSignedActions: SignedActionStep[]
}

/**
 * Result from {@link PerpsClient.executeProviderSetup}.
 *
 * @public
 */
export interface ExecuteProviderSetupResult {
  /** Results from user-signed setup submission */
  userResults: ExecuteActionResponse
  /** Results from agent-signed setup submission (if any) */
  agentResults?: ExecuteActionResponse
  /**
   * Fallback user-wallet setup steps surfaced when an agent-signed
   * `ACCOUNT_MODE` dispatch is not authorised (e.g. Hyperliquid refuses to
   * upgrade from a non-default abstraction variant without a user signature).
   * Caller must re-sign these with the user's wallet.
   */
  fallbackUserProviderSetup?: ActionStep[]
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
