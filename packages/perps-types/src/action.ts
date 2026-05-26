import type { AssetDisplay, AssetIdentity } from './asset.js'
import type {
  ActionType,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  TriggerCondition,
} from './enums.js'
import type { Address, Hex, PerpsTypedData } from './typedData.js'

export interface Eip712ActionStep {
  action: ActionType
  typedData: PerpsTypedData
}

export interface WasmBlobActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
}

export interface EvmTxActionStep {
  action: ActionType
  txParams: Record<string, unknown>
}

export type ActionStep = Eip712ActionStep | WasmBlobActionStep | EvmTxActionStep

export interface Eip712SignedActionStep {
  action: ActionType
  typedData: PerpsTypedData
  signature: Hex
}

export interface WasmBlobSignedActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
  signedTx: {
    txType: number
    txInfo: string
    txHash: string
  }
}

export interface EvmTxSignedActionStep {
  action: ActionType
  txParams: Record<string, unknown>
  txHash: string
}

export type SignedActionStep =
  | Eip712SignedActionStep
  | WasmBlobSignedActionStep
  | EvmTxSignedActionStep

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
    }

// ---------------------------------------------------------------------------
// Shared data types
// ---------------------------------------------------------------------------

export interface TriggerOrderInput {
  triggerPrice: string
  limitPrice?: string
}

export interface ModifyOrderInput {
  id: string
  price?: string
  size?: string
  triggerPrice?: string
  limitPrice?: string
}

export interface Order {
  orderId: string
  asset: AssetDisplay
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

// ---------------------------------------------------------------------------
// Per-action param types
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  asset: AssetIdentity
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

export interface PlaceTriggerOrderParams {
  asset: AssetIdentity
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

export interface CancelOrderParams {
  ids: string[]
}

export interface ModifyOrderParams {
  modifications: ModifyOrderInput[]
}

export interface UpdateLeverageParams {
  asset: AssetIdentity
  leverage: number
  /** Omitted falls back to the provider's default (currently CROSS). */
  marginMode?: MarginMode
}

export interface UpdatePositionMarginParams {
  asset: AssetIdentity
  action: 'add' | 'remove'
  amount: string
}

export interface WithdrawalParams {
  destination: Address
  amount: string
}

export interface DepositParams {
  /** Amount of the token to deposit (human-readable, e.g. "100.5"). */
  amount: string
  /** ERC-20 token address on the source chain. */
  tokenAddress: Address
  /** Chain ID of the source chain (e.g. 1 for Ethereum, 42161 for Arbitrum). */
  chainId: number
}

export interface ApproveAgentParams {
  agentAddress: string
  agentTtlMs?: number
}

export interface AccountModeParams {
  mode: string
}

export interface AccountTypeParams {
  tier: string
}

export interface SendAssetParams {
  collateral: string
  sourceDex: string
  destinationDex: string
  amount: string
}

// ---------------------------------------------------------------------------
// ActionParamsMap — compile-time type resolution for SDK
// ---------------------------------------------------------------------------

export interface CancelAllOrdersParams {
  /** 0=immediate (cancel GTC), 1=scheduled, 2=abort scheduled */
  timeInForce: number
  /** Unix timestamp in milliseconds (required for scheduled cancels) */
  timestampMs?: number
}

export interface RegisterApiKeyParams {
  /** The API key slot index to register (0-255). Reusing a fixed slot overwrites the old key. */
  apiKeyIndex: number
}

export interface ApproveReadOnlyTokenParams {
  accountIndex: number
  /** Absolute unix-seconds expiry. Lighter requires lifetime between 1 day and 10 years. */
  expirySeconds: number
  scope: 'single' | 'all'
}

export interface ActionParamsMap {
  [ActionType.APPROVE_AGENT]: ApproveAgentParams
  [ActionType.APPROVE_BUILDER_FEE]: Record<string, never>
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
  [ActionType.REGISTER_API_KEY]: RegisterApiKeyParams
  [ActionType.APPROVE_READ_ONLY_TOKEN]: ApproveReadOnlyTokenParams
  [ActionType.DEPOSIT]: DepositParams
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export type CreateActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    params: ActionParamsMap[K]
  }
}[ActionType]

export interface CreateActionResponse {
  actions: ActionStep[]
}

export type ExecuteActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    actions: SignedActionStep[]
  }
}[ActionType]

export interface ExecuteActionResponse {
  results: ActionResult[]
}
