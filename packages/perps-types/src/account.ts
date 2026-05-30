import type { AssetDisplay } from './asset.js'
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
import type { Address } from './primitives.js'

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
  orderId: string
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
  config: AccountConfig
}

/**
 * How a venue groups collateral for margin.
 *
 * - `unified`: a single cross-margin pool; spot balances ARE the margin asset
 *   and are valued as total token holdings.
 * - `perMarket`: collateral is held per market (spot vs each perps venue) and
 *   free margin is tracked separately from locked margin.
 *
 * Provider-agnostic replacement for branching on a venue-specific abstraction
 * enum: consumers read {@link CollateralGrouping.unified} instead of mapping
 * Hyperliquid's `abstractionMode`.
 */
export type CollateralGrouping = 'unified' | 'perMarket'

export interface AccountSummary {
  portfolioValue: number
  availableMargin: number
  marginUsed: number
  unrealizedPnl: number
  /**
   * Whether collateral is a single unified cross-margin pool (`'unified'`) or
   * held per market (`'perMarket'`). Drives margin roll-up and collateral-section
   * grouping without consumers branching on provider identity.
   */
  collateralGrouping: CollateralGrouping
}

export interface TriggerOrder {
  orderId: string
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

// At least one of `counterpartyAccountIndex` / `counterpartyAddress` is always
// present; both may appear together.
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
