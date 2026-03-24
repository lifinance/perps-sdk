import type { OrderType } from './enums.js'
import {
  type ActionType,
  type OrderSide,
  type OrderStatus,
  type TimeInForce,
  type TriggerCondition,
} from './enums.js'
import type { Address, Hex, PerpsTypedData } from './typedData.js'

// ---------------------------------------------------------------------------
// Action step types (create → sign → execute flow)
// ---------------------------------------------------------------------------

export interface ActionStep {
  action: ActionType
  typedData: PerpsTypedData
}

export interface SignedActionStep {
  action: ActionType
  typedData: PerpsTypedData
  signature: Hex
}

export interface ActionResult {
  action: ActionType
  success: boolean
  orderId?: string
  error?: string
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
  symbol: string
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
  averagePrice?: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Per-action param types
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  symbol: string
  side: OrderSide
  type?: OrderType
  size: string
  price?: string
  leverage?: number
  reduceOnly?: boolean
  timeInForce?: TimeInForce
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
  market?: 'spot' | 'perps'
}

export interface PlaceTriggerOrderParams {
  symbol: string
  side: OrderSide
  type?: OrderType
  size: string
  triggerPrice: string
  limitPrice?: string
  reduceOnly?: boolean
}

export interface CancelOrderParams {
  ids: string[]
}

export interface ModifyOrderParams {
  symbol: string
  side: OrderSide
  modifications: ModifyOrderInput[]
}

export interface UpdateLeverageParams {
  symbol: string
  leverage: number
}

export interface UpdatePositionMarginParams {
  symbol: string
  action: 'add' | 'remove'
  amount: string
}

export interface WithdrawalParams {
  destination: Address
  amount: string
}

export interface ApproveAgentParams {
  agentAddress: string
  agentTtlMs?: number
}

export interface SetAbstractionParams {
  abstraction?: string
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

export interface ActionParamsMap {
  [ActionType.APPROVE_AGENT]: ApproveAgentParams
  [ActionType.APPROVE_BUILDER_FEE]: Record<string, never>
  [ActionType.USER_SET_ABSTRACTION]: SetAbstractionParams
  [ActionType.AGENT_SET_ABSTRACTION]: SetAbstractionParams
  [ActionType.SEND_ASSET]: SendAssetParams
  [ActionType.WITHDRAWAL]: WithdrawalParams
  [ActionType.PLACE_ORDER]: PlaceOrderParams
  [ActionType.PLACE_TRIGGER_ORDER]: PlaceTriggerOrderParams
  [ActionType.CANCEL_ORDER]: CancelOrderParams
  [ActionType.MODIFY_ORDER]: ModifyOrderParams
  [ActionType.UPDATE_LEVERAGE]: UpdateLeverageParams
  [ActionType.UPDATE_POSITION_MARGIN]: UpdatePositionMarginParams
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface CreateActionRequest {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  params: ActionParamsMap[ActionType]
}

export interface CreateActionResponse {
  actions: ActionStep[]
}

export interface ExecuteActionRequest {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  actions: SignedActionStep[]
}

export interface ExecuteActionResponse {
  results: ActionResult[]
}
