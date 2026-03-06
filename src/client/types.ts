import type {
  Address,
  AuthorizationAction,
  AuthorizationInput,
  AuthorizationsResponse,
  OrderSide,
  OrderType,
  SignedAuthorization,
  TimeInForce,
  TriggerOrderInput,
  WithdrawalInput,
} from '@lifi/perps-types'
import type { StorageAdapter } from '../agent/types.js'

// Re-export the SDK client types from createPerpsClient
export type {
  PerpsBaseConfig,
  PerpsConfig,
  PerpsSDKClient,
  RequestInterceptor,
  SDKRequestOptions,
} from './createPerpsClient.js'

/**
 * Signing mode determines who signs trading actions.
 *
 * - `USER`: User wallet signs each action (requires wallet popup per action)
 * - `USER_AGENT`: SDK-generated agent signs actions (no popups after initial setup)
 */
export type SigningMode = 'USER' | 'USER_AGENT'

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
}

/**
 * Parameters for building authorization payloads.
 */
export interface BuildAuthorizationParams {
  /** DEX to authorize */
  dex: string
  /** User wallet address */
  address: Address
  /** Address of the signer (auto-set in USER_AGENT mode) */
  signerAddress?: Address
  /** Authorizations to create */
  authorizations: AuthorizationInput[]
}

/**
 * Parameters for placing an order.
 */
export interface PlaceOrderParams {
  /** DEX to place order on */
  dex: string
  /** User wallet address */
  address: Address
  /** Market symbol */
  symbol: string
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
export type PlaceTriggerOrderParams = Pick<
  PlaceOrderParams,
  'dex' | 'address' | 'symbol' | 'side' | 'size' | 'takeProfit' | 'stopLoss'
>

/**
 * Parameters for building a withdrawal payload.
 */
export interface BuildWithdrawalParams {
  /** DEX to withdraw from */
  dex: string
  /** User wallet address (account owner) */
  address: Address
  /** Withdrawal details */
  withdrawal: WithdrawalInput
}

/**
 * Parameters for canceling orders.
 */
export interface CancelOrdersParams {
  /** DEX to cancel orders on */
  dex: string
  /** User wallet address */
  address: Address
  /** Order IDs to cancel */
  ids: string[]
}

/**
 * Parameters for getRequiredAuthorizations().
 */
export interface GetRequiredAuthorizationsParams {
  /** DEX to check authorizations for */
  dex: string
  /** User wallet address */
  address: Address
}

/**
 * Result from getRequiredAuthorizations().
 */
export interface RequiredAuthorizationsResult {
  /** Authorization actions requiring user wallet signature (with typed data for signing) */
  userAuthorizations: AuthorizationAction[]
  /** Authorization actions the SDK auto-signs with the agent (with typed data) */
  agentAuthorizations: AuthorizationAction[]
  /** Whether all authorizations are already satisfied (ready to trade) */
  isReady: boolean
}

/**
 * Parameters for executeAuthorizations().
 */
export interface ExecuteAuthorizationsParams {
  /** DEX to authorize */
  dex: string
  /** User wallet address */
  address: Address
  /** The result from getRequiredAuthorizations() */
  required: RequiredAuthorizationsResult
  /** User-signed actions corresponding to required.userAuthorizations */
  userSignedActions: SignedAuthorization[]
}

/**
 * Result from executeAuthorizations().
 */
export interface ExecuteAuthorizationsResult {
  /** Results from user-signed authorization submission */
  userResults: AuthorizationsResponse
  /** Results from agent-signed authorization submission (if any) */
  agentResults?: AuthorizationsResponse
}
