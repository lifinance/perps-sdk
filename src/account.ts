import type { Address } from './typedData.js'
import type {
  ActivityType,
  HistoryItemStatus,
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
  symbol: string
  assetId: number
  dex: string
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
  symbol: string
  assetId: number
  dex: string
  side: OrderSide
  type: OrderType
  size: string
  price: string
  filledSize: string
  reduceOnly: boolean
  createdAt: string
}

export interface Balance {
  currency: string
  amount: string
}

export interface AccountResponse {
  dex: string
  address: Address
  balances: Balance[]
  marginUsed: string
  unrealizedPnl: string
  feeTier: FeeTier
  positions: Position[]
  openOrders: OpenOrder[]
  config: Record<string, unknown>
}

export interface HistoryItem {
  id: string
  symbol: string
  assetId: number
  dex: string
  side: OrderSide
  type: OrderType
  size: string
  price: string
  status: HistoryItemStatus
  filledSize?: string
  fee?: string
  realizedPnl?: string | null
  createdAt: string
}

export interface Pagination {
  limit: number
  hasMore: boolean
  cursor?: string
  nextUrl?: string
}

export interface HistoryResponse {
  dex: string
  items: HistoryItem[]
  pagination: Pagination
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export interface BaseActivity {
  id: string
  dex: string
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
  symbol: string
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
  symbol: string
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
  dex: string
  items: ActivityItem[]
  pagination: Pagination
}
