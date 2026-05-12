import type { Address } from './typedData.js'
import type { AssetDisplay } from './asset.js'
import type {
  ActivityType,
  FillClassification,
  FillStatus,
  LiquidityRole,
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
  asset: AssetDisplay
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
  asset: AssetDisplay
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
  asset: AssetDisplay
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
  orderId: string
  asset: AssetDisplay
  side: OrderSide
  type: OrderType
  size: string
  price: string
  status: FillStatus
  liquidity: LiquidityRole
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
  asset: AssetDisplay
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
  asset: AssetDisplay
  amount: string
  positionSize: string
  fundingRate: string
}

/**
 * Internal transfer between two accounts on the same provider (e.g. Lighter
 * `/api/v1/transfer/history`, Hyperliquid `spotTransfer` ledger entry).
 * Direction is relative to the queried account.
 *
 * The counterparty is identified by either an account index (integer L2
 * account identifier — Lighter) or a wallet address (Hyperliquid, where
 * accounts ARE addresses). The type is a discriminated union over these two
 * shapes: at least one of `counterpartyAccountIndex` / `counterpartyAddress`
 * MUST be present, and either may appear alone or alongside the other.
 *
 * Consumers that render counterparties should prefer `counterpartyAccountIndex`
 * when present (it's the canonical handle on index-based providers) and fall
 * back to a truncated `counterpartyAddress` otherwise.
 */
export type TransferActivity = BaseActivity & {
  type: ActivityType.TRANSFER
  direction: 'IN' | 'OUT'
  asset: string
  amount: string
  meta?: Record<string, unknown>
} & (
    | { counterpartyAccountIndex: number; counterpartyAddress?: string }
    | { counterpartyAccountIndex?: number; counterpartyAddress: string }
  )

export type ActivityItem =
  | DepositActivity
  | WithdrawalActivity
  | LiquidationActivity
  | FundingActivity
  | TransferActivity

export interface ActivitiesResponse {
  provider: string
  items: ActivityItem[]
  pagination: Pagination
}
