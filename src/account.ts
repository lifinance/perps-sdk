import type { Address } from './typedData.js'
import type { AssetIdentity } from './market.js'
import type {
  ActivityType,
  FillClassification,
  FillStatus,
  MarginMode,
  OrderSide,
  OrderType,
  PositionSide,
} from './enums.js'

export interface FeeTier {
  maker: string
  taker: string
}

export interface Position {
  asset: AssetIdentity
  side: PositionSide
  size: string
  entryPrice: string
  markPrice: string
  liquidationPrice: string
  unrealizedPnl: string
  leverage: number
  marginUsed: string
  marginMode: MarginMode
}

export interface OpenOrder {
  id: string
  asset: AssetIdentity
  side: OrderSide
  type: OrderType
  size: string
  price: string
  filledSize: string
  reduceOnly: boolean
  label?: string
  createdAt: string
}

export interface Balance {
  currency: string
  amount: string
}

export interface AccountResponse {
  provider: string
  address: Address
  balances: Record<string, Balance[]>
  marginUsed: string
  unrealizedPnl: string
  feeTier: FeeTier
  config: Record<string, unknown>
}

export interface TriggerOrder {
  id: string
  asset: AssetIdentity
  type: OrderType
  size: string
  triggerPrice: string
  limitPrice?: string
  label?: string
  createdAt: string
}

export interface PositionsResponse {
  provider: string
  positions: Position[]
  pagination: Pagination
}

export interface OrdersResponse {
  provider: string
  openOrders: OpenOrder[]
  triggerOrders: TriggerOrder[]
  pagination: Pagination
}

export interface Fill {
  id: string
  asset: AssetIdentity
  side: OrderSide
  type: OrderType
  size: string
  price: string
  status: FillStatus
  filledSize?: string
  fee?: string
  realizedPnl?: string | null
  startPosition?: string
  classification: FillClassification
  createdAt: string
}

export interface Pagination {
  limit: number
  hasMore: boolean
  cursor?: string
  nextUrl?: string
}

export interface FillsResponse {
  provider: string
  items: Fill[]
  pagination: Pagination
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export interface BaseActivity {
  id: string
  provider: string
  timestamp: string
}

export interface DepositActivity extends BaseActivity {
  type: ActivityType.DEPOSIT
  amount: string
}

export interface WithdrawalActivity extends BaseActivity {
  type: ActivityType.WITHDRAWAL
  amount: string
  fee: string
}

export interface LiquidatedPosition {
  asset: AssetIdentity
  size: string
}

export interface LiquidationActivity extends BaseActivity {
  type: ActivityType.LIQUIDATION
  liquidatedNotionalPosition: string
  accountValue: string
  leverageType: string
  liquidatedPositions: LiquidatedPosition[]
}

export interface FundingActivity extends BaseActivity {
  type: ActivityType.FUNDING
  asset: AssetIdentity
  amount: string
  positionSize: string
  fundingRate: string
}

export type ActivityItem =
  | DepositActivity
  | WithdrawalActivity
  | LiquidationActivity
  | FundingActivity

export interface ActivitiesResponse {
  provider: string
  items: ActivityItem[]
  pagination: Pagination
}
