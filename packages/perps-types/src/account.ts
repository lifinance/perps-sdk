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

/** @public */
export interface FeeTier {
  maker: string
  taker: string
}

/** @public */
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

/** @public */
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

/** @public */
export interface Balance {
  /** Which category/venue this balance sits in — references a {@link ProviderCategory}. */
  categoryId: string
  asset: Asset
  units: string
  /** USD value the SDK fills from the prices map; consumers render with zero math. */
  valueUsd: string
}

/** @public */
export interface AccountResponse {
  provider: string
  address: Address
  /** Flat, NON-collateral holdings. */
  balances: Balance[]
  /** SDK-determined collateral subset: spot balances in a category's quote asset. */
  collateralBalances: Balance[]
  /** Open positions the snapshot already computed; equals the unfiltered `getPositions` output. */
  positions: Position[]
  marginUsed: string
  unrealizedPnl: string
  feeTier: FeeTier
  config: AccountConfig
}

/** @public */
export interface AccountSummary {
  portfolioValue: string
  availableMargin: string
  marginUsed: string
  unrealizedPnl: string
}

/** @public */
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

/** @public */
export interface PositionsResponse {
  provider: string
  positions: Position[]
  pagination: Pagination
}

/** @public */
export interface OrdersResponse {
  provider: string
  openOrders: OpenOrder[]
  triggerOrders: TriggerOrder[]
  pagination: Pagination
}

/** @public */
export interface Fill {
  id: string
  orderId: string
  market: MarketDisplay
  side: OrderSide
  /**
   * The originating order type, when derivable from the fill. Absent when a
   * provider's fill payload doesn't carry it and it can't be inferred (e.g. a
   * Hyperliquid taker fill, which may be a market or an aggressive limit order).
   */
  type?: OrderType
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
  // the fill has no on-chain settlement tx.
  explorerLink?: string
}

/** @public */
export interface Pagination {
  limit: number
  hasMore: boolean
  cursor?: string
  nextUrl?: string
}

/** @public */
export interface FillsResponse {
  provider: string
  items: Fill[]
  pagination: Pagination
}

/** @public */
export interface BaseActivity {
  id: string
  provider: string
  timestamp: string
}

/** @public */
export interface DepositActivity extends BaseActivity {
  type: ActivityType.DEPOSIT
  amount: string
  // Fully-resolved block-explorer URL for the on-chain deposit tx.
  explorerLink?: string
}

/** @public */
export interface WithdrawalActivity extends BaseActivity {
  type: ActivityType.WITHDRAWAL
  amount: string
  fee: string
  // Fully-resolved block-explorer URL for the on-chain withdrawal tx.
  explorerLink?: string
}

/** @public */
export interface LiquidatedPosition {
  market: MarketDisplay
  size: string
}

/** @public */
export interface LiquidationActivity extends BaseActivity {
  type: ActivityType.LIQUIDATION
  liquidatedNotionalPosition: string
  accountValue: string
  leverageType: string
  liquidatedPositions: LiquidatedPosition[]
}

/** @public */
export interface FundingActivity extends BaseActivity {
  type: ActivityType.FUNDING
  market: MarketDisplay
  amount: string
  positionSize: string
  fundingRate: string
}

// At least one of `counterpartyAccountIndex` / `counterpartyAddress` is always
// present; both may appear together.
/** @public */
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

/** @public */
export type ActivityItem =
  | DepositActivity
  | WithdrawalActivity
  | LiquidationActivity
  | FundingActivity
  | TransferActivity

/** @public */
export interface ActivitiesResponse {
  provider: string
  items: ActivityItem[]
  pagination: Pagination
}

// Account configuration state — typed `AccountResponse.config`.

/** @public */
export type HyperliquidAgent = Record<string, unknown>

/** @public */
export interface HyperliquidBuilderFeeApproval {
  builderAddress: string
  /** Basis points as a string. */
  maxFeeRate: string
  approved: boolean
}

/** @public */
export interface HyperliquidAccountConfig {
  provider: 'hyperliquid'
  /** `null` means abstraction has never been set. */
  abstractionMode: string | null
  agents: HyperliquidAgent[]
  builderFeeApproval?: HyperliquidBuilderFeeApproval
}

/** @public */
export interface LighterAssetCollateral {
  /** Provider-native spot asset id (matches `Asset.id`). */
  assetId: string
  /** Whether this asset's balance counts toward the cross-margin collateral pool. */
  enabled: boolean
}

/** @public */
export interface LighterAccountConfig {
  provider: 'lighter'
  accountIndex: number
  apiKeyIndex: number
  apiKeyRegistered: boolean
  accountType: number
  /** Lighter `account_trading_mode`: 0 = Classic/Simple, 1 = Unified. */
  accountTradingMode: number
  /**
   * Per-asset cross-margin collateral flags for held spot assets, decoded from
   * each asset's `margin_mode`. Meaningful only when `accountTradingMode === 1`;
   * assets whose `margin_mode` Lighter omits are not listed.
   */
  assetCollateral: LighterAssetCollateral[]
  readOnlyTokenApproved: boolean
  /** Unix seconds. Present iff `readOnlyTokenApproved === true`. */
  readOnlyTokenExpiry?: number
  /** Present iff `readOnlyTokenApproved === true`. */
  readOnlyTokenScope?: 'single' | 'all'
}

/** @public */
export interface OndoAccountConfig {
  provider: 'ondo'
  loggedIn: boolean
  /** Unix seconds. Present iff `loggedIn === true`. The token itself never appears here. */
  authTokenExpiry?: number
  /** A referral code (any referrer's) is already applied to the account. Always `false` when logged out. */
  referralSet: boolean
}

/** @public */
export type AccountConfig =
  | HyperliquidAccountConfig
  | LighterAccountConfig
  | OndoAccountConfig

/** @public */
export interface AccountConfigValue {
  name: string
  /** `null` means no current value — consumers fall back to the descriptor default. */
  value: string | number | boolean | null
}

/** @public */
export interface AccountConfigSetting {
  type: ActionType
  values: AccountConfigValue[]
  /** `undefined` means satisfaction is tracked outside `AccountConfig` (e.g. backend `checkSetup`). */
  satisfied?: boolean
}
