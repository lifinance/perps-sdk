import type { Asset } from './asset.js'
import type {
  ActionType,
  ActivityType,
  FillClassification,
  FillStatus,
  LiquidityRole,
  MarginMode,
  OrderSide,
  OrderType,
  PositionSide,
} from './enums.js'
import type { MarketDisplay } from './market.js'
import type { Address } from './primitives.js'

export interface FeeTier {
  maker: string
  taker: string
}

export interface Position {
  market: MarketDisplay
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
  orderId: string
  market: MarketDisplay
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
  /** Which category/venue this balance sits in — references a {@link ProviderCategory}. */
  categoryId: string
  asset: Asset
  units: string
  /** USD value the SDK fills from the prices map; consumers render with zero math. */
  valueUsd: string
}

export interface AccountResponse {
  provider: string
  address: Address
  /** Flat, NON-collateral holdings. */
  balances: Balance[]
  /** SDK-determined collateral subset: spot balances in a category's quote asset. */
  collateralBalances: Balance[]
  marginUsed: string
  unrealizedPnl: string
  feeTier: FeeTier
  config: AccountConfig
}

export interface AccountSummary {
  portfolioValue: string
  availableMargin: string
  marginUsed: string
  unrealizedPnl: string
}

export interface TriggerOrder {
  orderId: string
  market: MarketDisplay
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
  market: MarketDisplay
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
  // Fully-resolved block-explorer URL for the settling on-chain tx. Absent when
  // the fill has no on-chain tx (every Hyperliquid fill is off-chain).
  explorerLink?: string
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
  // Fully-resolved block-explorer URL for the on-chain deposit tx.
  explorerLink?: string
}

export interface WithdrawalActivity extends BaseActivity {
  type: ActivityType.WITHDRAWAL
  amount: string
  fee: string
  // Fully-resolved block-explorer URL for the on-chain withdrawal tx.
  explorerLink?: string
}

export interface LiquidatedPosition {
  market: MarketDisplay
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
  market: MarketDisplay
  amount: string
  positionSize: string
  fundingRate: string
}

// At least one of `counterpartyAccountIndex` / `counterpartyAddress` is always
// present; both may appear together.
export type TransferActivity = BaseActivity & {
  type: ActivityType.TRANSFER
  direction: 'IN' | 'OUT'
  asset: string
  amount: string
  meta?: Record<string, unknown>
  // Fully-resolved block-explorer URL for the on-chain transfer tx.
  explorerLink?: string
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

// ---------------------------------------------------------------------------
// Account configuration state — typed `AccountResponse.config`
// ---------------------------------------------------------------------------

export type HyperliquidAgent = Record<string, unknown>

export interface HyperliquidBuilderFeeApproval {
  builderAddress: string
  /** Basis points as a string. */
  maxFeeRate: string
  approved: boolean
}

export interface HyperliquidAccountConfig {
  provider: 'hyperliquid'
  /** `null` means abstraction has never been set. */
  abstractionMode: string | null
  agents: HyperliquidAgent[]
  builderFeeApproval?: HyperliquidBuilderFeeApproval
}

export interface LighterAccountConfig {
  provider: 'lighter'
  accountIndex: number
  apiKeyIndex: number
  apiKeyRegistered: boolean
  accountType: number
  readOnlyTokenApproved: boolean
  /** Unix seconds. Present iff `readOnlyTokenApproved === true`. */
  readOnlyTokenExpiry?: number
  /** Present iff `readOnlyTokenApproved === true`. */
  readOnlyTokenScope?: 'single' | 'all'
}

export type AccountConfig = HyperliquidAccountConfig | LighterAccountConfig

export interface AccountConfigValue {
  name: string
  /** `null` means no current value — consumers fall back to the descriptor default. */
  value: string | number | boolean | null
}

export interface AccountConfigSetting {
  type: ActionType
  values: AccountConfigValue[]
  /** `undefined` means satisfaction is tracked outside `AccountConfig` (e.g. backend `checkSetup`). */
  satisfied?: boolean
}
