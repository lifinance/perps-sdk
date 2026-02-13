import type { StorageAdapter } from '../agent/types.js'
import type {
  Address,
  AuthorizationInput,
  AuthorizationsResponse,
  OrderSide,
  OrderType,
  SignedAuthorization,
  TimeInForce,
  TriggerOrderInput,
} from '../types/perps.js'

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
  /** Optional API key for authenticated requests */
  apiKey?: string
  /** Base API URL. Defaults to https://li.quest/v1/perps */
  apiUrl?: string
  /** Custom storage adapter for agent keys. Defaults to localStorage. */
  storage?: StorageAdapter
  /** Whether to perform a health check on startup before allowing requests. Default: true */
  healthCheck?: boolean
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
  /** Client-provided order ID */
  clientOrderId?: string
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
  /** Whether to require abstraction (for HIP-3 assets). Default: false */
  requireAbstraction?: boolean
}

/**
 * Result from getRequiredAuthorizations().
 */
export interface RequiredAuthorizationsResult {
  /** Authorizations requiring user wallet signature (0, 1, or 2 items) */
  userAuthorizations: AuthorizationInput[]
  /** Authorizations the SDK auto-signs with the agent after user auths are submitted */
  agentAuthorizations: AuthorizationInput[]
  /** Whether the local agent is registered and valid on the backend */
  agentValid: boolean
  /** The raw abstractionStatus from config (null=never set, 'disabled', 'unifiedAccount', 'portfolioMargin') */
  abstractionStatus: string | null
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
