import type { Address, Hex, PerpsTypedData } from './typedData.js'
import type {
  OrderActionType,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  TriggerCondition,
} from './enums.js'

export interface TriggerOrderInput {
  triggerPrice: string
  limitPrice?: string
}

export interface CreateOrderRequest {
  dex: string
  address: Address
  signerAddress?: Address
  clientOrderId?: string
  symbol: string
  side: OrderSide
  type: OrderType
  size: string
  price: string
  leverage?: number
  reduceOnly?: boolean
  timeInForce?: TimeInForce
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

export interface OrderAction {
  action: OrderActionType
  description?: string
  typedData: PerpsTypedData
}

export interface CreateOrderResponse {
  actions: OrderAction[]
}

export interface CancelOrderRequest {
  dex: string
  address: Address
  signerAddress?: Address
  ids: string[]
}

export interface CancelOrderPayloadResponse {
  actions: OrderAction[]
}

export interface SignedOrderAction {
  action: OrderActionType
  typedData: PerpsTypedData
  signature: Hex
}

export interface SubmitOrderRequest {
  dex: string
  address: Address
  signerAddress?: Address
  actions: SignedOrderAction[]
}

export interface OrderActionResult {
  action: OrderActionType
  success: boolean
  orderId?: string
  error?: string
}

export interface SubmitOrderResponse {
  results: OrderActionResult[]
}

export interface Order {
  orderId: string
  clientOrderId?: string
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
