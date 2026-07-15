import type { AcceptTermsParams } from './acceptTerms.js'
import type {
  ActionType,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
  TriggerCondition,
} from './enums.js'
import type { MarketDisplay, MarketRef } from './market.js'
import type { Address, Hex } from './primitives.js'
import type { PerpsTypedData } from './typedData.js'
import type { VoteParams } from './vote.js'

/** @public */
export interface Eip712ActionStep {
  action: ActionType
  typedData: PerpsTypedData
}

/** @public */
export interface WasmBlobActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
}

/**
 * An unencoded viem-style contract call crossing the backend→SDK boundary as an
 * `EVM_TX` step's `txParams`. The call is encoded SDK-side (viem `parseAbi` +
 * `writeContract`), so `abi` holds human-readable signatures rather than a viem
 * `Abi` — keeping `perps-types` viem-free.
 * @public
 */
export interface EvmCall {
  chainId: number
  to: Address
  functionName: string
  args: readonly unknown[]
  /** Human-readable ABI signatures, e.g. `'function approve(address,uint256) returns (bool)'`, fed to viem `parseAbi`. */
  abi: readonly string[]
}

/** @public */
export interface EvmTxActionStep {
  action: ActionType
  txParams: EvmCall
}

/**
 * A venue request crossing the backend→SDK boundary unsigned. The SDK computes
 * a per-request HMAC signature from a client-held API key, attaches it as a
 * structured `hmac` field (yielding an {@link HmacSignedActionStep}), and the
 * signed step rides the normal `executeAction` path.
 * @public
 */
export interface HmacActionStep {
  action: ActionType
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    /** Venue-relative, e.g. `/v1/perps/orders`; base URL resolution is provider-side. */
    path: string
    /**
     * Pre-serialized request body that transits verbatim — the exact byte
     * string the HMAC signature covers, never re-serialized downstream.
     */
    body?: string
  }
}

/**
 * A marker for a client-only setup step the SDK executes directly against the
 * venue with the provider session token. Deliberately carries no request
 * material: a bearer token authorizes whatever request it is attached to, so
 * the SDK authors the venue call itself, keyed on `action`, and never applies
 * the token to a backend-authored path or body. The signing arm returns no
 * signed step, so `executeAction` is skipped.
 * @public
 */
export interface SessionActionStep {
  action: ActionType
  session: Record<string, never>
}

/** @public */
export interface SiweActionStep {
  action: ActionType
  siwe: {
    challengeId: string
    /** The backend-built ERC-4361 challenge the wallet must `personal_sign`. */
    message: string
  }
}

/** @public */
export type ActionStep =
  | Eip712ActionStep
  | WasmBlobActionStep
  | EvmTxActionStep
  | HmacActionStep
  | SessionActionStep
  | SiweActionStep

/** @public */
export interface Eip712SignedActionStep {
  action: ActionType
  typedData: PerpsTypedData
  signature: Hex
}

/** @public */
export interface WasmBlobSignedActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
  signedTx: {
    txType: number
    txInfo: string
    txHash: string
  }
}

/** @public */
export interface EvmTxSignedActionStep {
  action: ActionType
  txParams: EvmCall
  txHash: string
}

/** @public */
export interface HmacSignedActionStep {
  action: ActionType
  request: HmacActionStep['request']
  /**
   * Per-request HMAC material computed SDK-side; the backend builds the venue's
   * transport headers from it at relay time.
   */
  hmac: {
    keyId: string
    /** Sign-time Unix timestamp in milliseconds; part of the signed message. */
    timestampMs: number
    signature: string
  }
}

/** @public */
export interface SiweSignedActionStep {
  action: ActionType
  siwe: SiweActionStep['siwe']
  signature: Hex
}

/** @public */
export type SignedActionStep =
  | Eip712SignedActionStep
  | WasmBlobSignedActionStep
  | EvmTxSignedActionStep
  | HmacSignedActionStep
  | SiweSignedActionStep

/** @public */
export type ActionResult =
  | {
      action: ActionType
      success: true
      orderId?: string
    }
  | {
      action: ActionType
      success: false
      error: string
      /** Structured classification of the failure, when the backend can provide one. */
      errorCode?: PerpsErrorCode
    }

/** @public */
export interface TriggerOrderInput {
  triggerPrice: string
  limitPrice?: string
}

/** @public */
export interface ModifyOrderInput {
  id: string
  price?: string
  size?: string
  triggerPrice?: string
  limitPrice?: string
}

/** @public */
export interface Order {
  orderId: string
  market: MarketDisplay
  side: OrderSide
  type: OrderType
  price?: string
  originalSize: string
  remainingSize: string
  filledSize: string
  timeInForce?: TimeInForce
  expiresAt?: string
  reduceOnly?: boolean
  isTrigger?: boolean
  triggerPrice?: string
  triggerCondition?: TriggerCondition
  status: OrderStatus
  /** Human-readable reason for a terminal non-FILLED status; undefined when no actionable detail. */
  statusReason?: string
  averagePrice?: string
  createdAt: string
  updatedAt: string
}

/** @public */
export interface PlaceOrderParams {
  market: MarketRef
  side: OrderSide
  type?: OrderType
  size: string
  price?: string
  leverage?: number
  /** Omitted falls back to the provider's default (currently CROSS). */
  marginMode?: MarginMode
  reduceOnly?: boolean
  timeInForce?: TimeInForce
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/** @public */
export interface PlaceTriggerOrderParams {
  market: MarketRef
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/** @public */
export interface CancelOrderParams {
  /** Venue order ids. Venues whose ids are scoped per market (e.g. Lighter's
   * `order_index`) also accept the composite `"<market_id>:<order_id>"`. */
  ids: string[]
  /** Market context for per-market order ids; the order's `market.id`. */
  assetId?: string
}

/** @public */
export interface ModifyOrderParams {
  modifications: ModifyOrderInput[]
}

/** @public */
export interface UpdateLeverageParams {
  market: MarketRef
  leverage: number
  /** Omitted falls back to the provider's default (currently CROSS). */
  marginMode?: MarginMode
}

/** @public */
export interface UpdatePositionMarginParams {
  market: MarketRef
  action: 'add' | 'remove'
  amount: string
}

/** @public */
export interface UpdateAssetCollateralParams {
  /** Provider-native spot asset id (matches `Asset.id`), keyed per asset — not per market. */
  assetId: string
  /** Whether this asset's balance counts toward the cross-margin collateral pool. */
  enabled: boolean
}

/** @public */
export interface WithdrawalParams {
  destination: Address
  amount: string
}

/** @public */
export interface DepositParams {
  /** Amount of the token to deposit (human-readable, e.g. "100.5"). */
  amount: string
  /** ERC-20 token address on the source chain. */
  tokenAddress: Address
  /** Chain ID of the source chain (e.g. 1 for Ethereum, 42161 for Arbitrum). */
  chainId: number
}

/** @public */
export interface ApproveAgentParams {
  agentAddress: string
  agentTtlMs?: number
}

/** @public */
export interface AccountModeParams {
  mode: string
}

/** @public */
export interface AccountTypeParams {
  tier: string
}

/** @public */
export interface SendAssetParams {
  /** Canonical `Asset.id` of the asset being moved (for Hyperliquid spot
   * assets, the token index as a string) — never a display symbol. */
  collateral: string
  sourceDex: string
  destinationDex: string
  amount: string
}

/** @public */
export interface CancelAllOrdersParams {
  /** 0=immediate (cancel GTC), 1=scheduled, 2=abort scheduled */
  timeInForce: number
  /** Unix timestamp in milliseconds (required for scheduled cancels) */
  timestampMs?: number
}

/** @public */
export interface RegisterApiKeyParams {
  /** The API key slot index to register (0-255). Reusing a fixed slot overwrites the old key. */
  apiKeyIndex: number
  /**
   * The SDK's currently-stored Lighter public key for this slot, if any. The
   * backend returns `[]` (already satisfied) only when this equals the
   * on-chain pubkey at the slot; otherwise it stages a ChangePubKey blob so
   * the slot can be (re-)registered. Omit when the SDK has no local key.
   */
  knownPublicKey?: string
}

/** @public */
export interface ApproveReadOnlyTokenParams {
  accountIndex: number
  /** Absolute unix-seconds expiry. Lighter requires lifetime between 1 day and 10 years. */
  expirySeconds: number
  scope: 'single' | 'all'
}

/** @public */
export interface ActionParamsMap {
  [ActionType.APPROVE_AGENT]: ApproveAgentParams
  [ActionType.APPROVE_BUILDER_FEE]: Record<string, never>
  [ActionType.APPROVE_INTEGRATOR]: Record<string, never>
  [ActionType.SET_REFERRAL]: Record<string, never>
  [ActionType.ACCOUNT_MODE]: AccountModeParams
  [ActionType.ACCOUNT_TYPE]: AccountTypeParams
  [ActionType.SEND_ASSET]: SendAssetParams
  [ActionType.WITHDRAWAL]: WithdrawalParams
  [ActionType.TRANSFER]: Record<string, never>
  [ActionType.PLACE_ORDER]: PlaceOrderParams
  [ActionType.PLACE_TRIGGER_ORDER]: PlaceTriggerOrderParams
  [ActionType.CANCEL_ORDER]: CancelOrderParams
  [ActionType.CANCEL_ALL_ORDERS]: CancelAllOrdersParams
  [ActionType.MODIFY_ORDER]: ModifyOrderParams
  [ActionType.UPDATE_LEVERAGE]: UpdateLeverageParams
  [ActionType.UPDATE_POSITION_MARGIN]: UpdatePositionMarginParams
  [ActionType.UPDATE_ASSET_COLLATERAL]: UpdateAssetCollateralParams
  [ActionType.REGISTER_API_KEY]: RegisterApiKeyParams
  [ActionType.APPROVE_READ_ONLY_TOKEN]: ApproveReadOnlyTokenParams
  [ActionType.SIWE_LOGIN]: Record<string, never>
  [ActionType.ACCEPT_PROVIDER_TERMS]: Record<string, never>
  [ActionType.DEPOSIT]: DepositParams
  [ActionType.META_VOTE]: VoteParams
  [ActionType.META_ACCEPT_TERMS]: AcceptTermsParams
}

/** @public */
export type CreateActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    params: ActionParamsMap[K]
  }
}[ActionType]

/** @public */
export interface CreateActionResponse {
  actions: ActionStep[]
}

/** @public */
export type ExecuteActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    actions: SignedActionStep[]
  }
}[ActionType]

/** @public */
export interface ExecuteActionResponse {
  results: ActionResult[]
}
