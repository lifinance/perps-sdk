import type {
  ActionStep,
  Address,
  AssetIdentity,
  ExecuteActionResponse,
  ModifyOrderInput,
  OrderSide,
  OrderType,
  SignedActionStep,
  TimeInForce,
  TriggerOrderInput,
  WithdrawalParams,
} from '@lifi/perps-types'
import type { StorageAdapter } from '../agent/types.js'
import type { LighterSignerConfig } from '../signers/lighter/index.js'
import type { ProviderConfigs } from './createPerpsClient.js'

// Re-export the SDK client types from createPerpsClient
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
 * Signing mode determines who signs trading actions.
 *
 * - `USER`: User wallet signs each action (requires wallet popup per action)
 * - `USER_AGENT`: SDK-generated agent signs actions (no popups after initial setup)
 */
export enum SigningMode {
  USER = 'USER',
  USER_AGENT = 'USER_AGENT',
}

/**
 * Options for PerpsClient constructor.
 */
export interface PerpsClientOptions {
  /** Integrator identifier (required) */
  integrator: string
  /** API key for authenticated requests (get one at https://portal.li.fi/) */
  apiKey: string
  /** Base API URL. Defaults to DEFAULT_API_URL */
  apiUrl?: string
  /** Custom storage adapter for agent keys. Defaults to localStorage. */
  storage?: StorageAdapter
  /** Provider-specific configuration */
  providers?: ProviderConfigs
  /**
   * Optional Lighter WASM signer configuration. Override the REST URL, chain
   * ID, or WASM asset locations. Omit to accept defaults (mainnet, chain 304,
   * WASM assets bundled with the package).
   */
  lighter?: LighterSignerConfig
}

/**
 * Parameters for checking prerequisites (previously: building authorization payloads).
 */
export interface CheckPrerequisitesParams {
  /** Provider to check prerequisites for */
  provider: string
  /** User wallet address */
  address: Address
  /** Address of the signer (auto-set in USER_AGENT mode) */
  signerAddress?: Address
}

/**
 * Parameters for placing an order.
 */
export interface PlaceOrderParams {
  /** Provider to place order on */
  provider: string
  /** User wallet address */
  address: Address
  /** Asset identity */
  asset: AssetIdentity
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
 */
export interface PlaceTriggerOrderParams {
  provider: string
  address: Address
  asset: AssetIdentity
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/**
 * Parameters for withdrawing funds.
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
 * Parameters for checkPrerequisites().
 */
export interface GetPrerequisitesParams {
  /** Provider to check prerequisites for */
  provider: string
  /** User wallet address */
  address: Address
}

/**
 * Result from checkPrerequisites().
 */
export interface PrerequisitesResult {
  /** Prerequisite steps requiring user wallet signature */
  userPrerequisites: ActionStep[]
  /** Prerequisite steps the SDK auto-signs with the agent */
  agentPrerequisites: ActionStep[]
  /** Whether all prerequisites are already satisfied (ready to trade) */
  isReady: boolean
}

/**
 * Parameters for executePrerequisites().
 */
export interface ExecutePrerequisitesParams {
  /** Provider to authorize */
  provider: string
  /** User wallet address */
  address: Address
  /** The result from checkPrerequisites() */
  required: PrerequisitesResult
  /** User-signed actions corresponding to required.userPrerequisites */
  userSignedActions: SignedActionStep[]
}

/**
 * Result from executePrerequisites().
 */
export interface ExecutePrerequisitesResult {
  /** Results from user-signed prerequisite submission */
  userResults: ExecuteActionResponse
  /** Results from agent-signed prerequisite submission (if any) */
  agentResults?: ExecuteActionResponse
  /**
   * Fallback user-wallet prerequisites surfaced when an agent-signed
   * `ACCOUNT_MODE` dispatch fails (e.g. Hyperliquid refuses to upgrade
   * from a non-default abstraction variant without a user signature).
   * The widget should re-sign these with the user's wallet.
   */
  fallbackUserPrerequisites?: ActionStep[]
}
