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
import type { MarketDisplay, PerpsMarketDisplay } from './market.js'
import type { Address } from './primitives.js'

/**
 * Maker and taker fee rates for the account's current venue tier.
 * Values are decimal fractions represented as strings (for example, `"0.0002"`).
 *
 * @public
 */
export interface FeeTier {
  /** Decimal fraction charged to maker fills, represented as a string. */
  maker: string
  /** Decimal fraction charged to taker fills, represented as a string. */
  taker: string
}

/**
 * Normalized open perpetual position with prices, margin, and PnL expressed as
 * decimal strings to preserve provider precision.
 *
 * @public
 */
export interface Position {
  market: PerpsMarketDisplay
  side: PositionSide
  /** Position quantity in base-asset units. */
  size: string
  /** Average entry price in quote-asset units. */
  entryPrice: string
  /** Current provider mark price in quote-asset units. */
  markPrice: string
  /** Estimated liquidation price in quote-asset units. */
  liquidationPrice: string
  /** Unrealized PnL in quote-currency units. */
  unrealizedPnl: string
  /**
   * Funding this position accrued since it opened, in quote-currency units.
   * Positive means the account received funding and negative means the account
   * paid it, matching {@link FundingActivity} amounts. Every venue resets the
   * value when the position returns to flat.
   */
  accruedFunding: string
  /** Position leverage as a numeric multiple. */
  leverage: number
  /**
   * Margin allocated and reserved by this position as a decimal string,
   * excluding unrealized PnL.
   */
  marginUsed: string
  /**
   * Exact initial margin the venue currently requires for this position.
   * Unlike `leverage`, this decimal string is safe for risk calculations.
   */
  initialMarginRequirement: string
  marginMode: MarginMode
}

/**
 * Exact provider-owned inputs for changing one position's dedicated margin.
 * `undefined` from the provider means the position has no individual margin
 * adjustment.
 * @public
 */
export interface PositionMarginConstraints {
  /** Exact margin the venue requires this position to retain. */
  minimumMarginRequirement: string
  /** Smallest accepted margin amount, as an exact decimal string. */
  amountIncrement: string
}

/**
 * Normalized non-trigger order currently open at a provider.
 *
 * @public
 */
export interface OpenOrder {
  orderId: string
  market: MarketDisplay
  side: OrderSide
  type: OrderType
  /** Quantity the order was submitted for, in base-asset units. */
  originalSize: string
  /** Quantity still resting on the book, in base-asset units. */
  remainingSize: string
  /** Limit/order price in quote-asset units. */
  price: string
  /** Quantity already filled in base-asset units. */
  filledSize: string
  reduceOnly: boolean
  label?: string
  /** ISO-8601 creation timestamp. */
  createdAt: string
}

/**
 * Asset balance normalized across providers. `units` and `valueUsd` are
 * decimal strings; `valueUsd` is the balance's USD valuation.
 *
 * @public
 */
export interface Balance {
  /** Which category/venue this balance sits in — references a {@link ProviderCategory}. */
  categoryId: string
  asset: Asset
  units: string
  /** USD value the SDK fills from the prices map; consumers render with zero math. */
  valueUsd: string
  /**
   * Fraction of `valueUsd` that backs available margin (a loan-to-value
   * ratio). Absent means 1 — full value. Set below 1 for collateral the
   * venue haircuts; ignored on non-collateral balances.
   */
  collateralWeight?: number
}

/**
 * Account snapshot returned by a provider, including balances, positions,
 * aggregate margin/PnL, and provider-specific configuration.
 *
 * @public
 */
export interface AccountResponse {
  provider: string
  address: Address
  /** Flat, NON-collateral holdings. */
  balances: Balance[]
  /** SDK-determined collateral subset: spot balances in a category's quote asset. */
  collateralBalances: Balance[]
  /** Open positions the snapshot already computed; equals the unfiltered `getPositions` output. */
  positions: Position[]
  /** Margin reserved across the account, represented as a decimal string. */
  marginUsed: string
  /** Unrealized account PnL, represented as a decimal string. */
  unrealizedPnl: string
  feeTier: FeeTier
  config: AccountConfig
}

/**
 * Aggregate account values for a provider stream or response. Monetary values
 * are decimal strings in USD.
 *
 * @public
 */
export interface AccountSummary {
  /** Total account portfolio value in USD. */
  portfolioValue: string
  /** Margin currently available for new orders in USD. */
  availableMargin: string
  /** Margin currently reserved by open positions/orders in USD. */
  marginUsed: string
  /** Aggregate unrealized PnL in USD. */
  unrealizedPnl: string
}

/**
 * The user's complete venue-side settings for one market: the margin mode
 * and display leverage the next order on it will use. A provider returns
 * `undefined` when it cannot read both values.
 * @public
 */
export interface MarketSettings {
  marginMode: MarginMode
  leverage: number
}

/**
 * Normalized take-profit or stop-loss order waiting for its trigger condition.
 *
 * @public
 */
export interface TriggerOrder {
  orderId: string
  market: MarketDisplay
  type: OrderType
  /** Triggered quantity in base-asset units. */
  size: string
  /** Price at which the trigger activates, in quote-asset units. */
  triggerPrice: string
  /** Optional limit price submitted after activation, in quote-asset units. */
  limitPrice?: string
  label?: string
  createdAt: string
}

/**
 * Paginated open-position response for one provider and account.
 *
 * @public
 */
export interface PositionsResponse {
  provider: string
  positions: Position[]
  pagination: Pagination
}

/**
 * Paginated open-order response containing regular and trigger orders.
 *
 * @public
 */
export interface OrdersResponse {
  provider: string
  openOrders: OpenOrder[]
  triggerOrders: TriggerOrder[]
  pagination: Pagination
}

/**
 * Normalized execution/fill record for an order.
 *
 * @public
 */
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
  /** Fully-resolved block-explorer URL for the settling on-chain tx. Absent when
   * the fill has no on-chain settlement tx. */
  explorerLink?: string
}

/**
 * Cursor pagination metadata. `cursor` and `nextUrl` are provider-specific
 * continuation values and are absent when no further page exists.
 *
 * @public
 */
export interface Pagination {
  limit: number
  hasMore: boolean
  cursor?: string
  nextUrl?: string
}

/**
 * Paginated fill response for one provider and account.
 *
 * @public
 */
export interface FillsResponse {
  provider: string
  items: Fill[]
  pagination: Pagination
}

/**
 * Common identity and timestamp fields shared by account activity records.
 * `timestamp` is an ISO-8601 timestamp string.
 *
 * @public
 */
export interface BaseActivity {
  id: string
  provider: string
  timestamp: string
}

/**
 * Account activity representing a completed deposit. `amount` is a decimal
 * string in `asset`'s units.
 *
 * @public
 */
export interface DepositActivity extends BaseActivity {
  type: ActivityType.DEPOSIT
  /**
   * Display symbol of the deposited asset, resolved by the provider adapter.
   * Falls back to the venue's own asset id when the registry knows no symbol.
   */
  asset: string
  amount: string
  /** Fully-resolved block-explorer URL for the on-chain deposit tx. */
  explorerLink?: string
}

/**
 * Account activity representing a completed withdrawal. `amount` and `fee`
 * are decimal strings in `asset`'s units — a withdrawal fee is always
 * denominated in the withdrawn asset.
 *
 * @public
 */
export interface WithdrawalActivity extends BaseActivity {
  type: ActivityType.WITHDRAWAL
  /**
   * Display symbol of the withdrawn asset, resolved by the provider adapter.
   * Falls back to the venue's own asset id when the registry knows no symbol.
   */
  asset: string
  amount: string
  /** Absent when the venue reports no fee for the withdrawal. */
  fee?: string
  /** Fully-resolved block-explorer URL for the on-chain withdrawal tx. */
  explorerLink?: string
}

/**
 * Position details attached to a liquidation activity.
 *
 * @public
 */
export interface LiquidatedPosition {
  market: MarketDisplay
  /** Absent when the venue reports no liquidated size for the position. */
  size?: string
}

/**
 * Account activity representing a liquidation event. `liquidatedPositions` is
 * never empty: a provider adapter drops any record whose positions it cannot
 * identify. A venue that liquidates several cross-margin positions in one
 * cascade reports them as one activity with several entries, so consumers
 * must never group activities by timestamp.
 *
 * @public
 */
export interface LiquidationActivity extends BaseActivity {
  type: ActivityType.LIQUIDATION
  /** Absent when the venue reports no liquidated notional. */
  liquidatedNotionalPosition?: string
  /** Absent when the venue reports no account value at liquidation time. */
  accountValue?: string
  leverageType: string
  liquidatedPositions: LiquidatedPosition[]
}

/**
 * Account activity representing a periodic funding payment. Amount and rate
 * retain provider precision as decimal strings.
 *
 * @public
 */
export interface FundingActivity extends BaseActivity {
  type: ActivityType.FUNDING
  market: MarketDisplay
  /**
   * Signed, in quote-currency units. Positive means the account received
   * funding; negative means the account paid it.
   */
  amount: string
  positionSize: string
  fundingRate: string
}

// At least one of `counterpartyAccountIndex` / `counterpartyAddress` is always
// present; both may appear together.
/**
 * Account activity representing an inbound or outbound transfer between two
 * distinct accounts. At least one counterparty identifier is required by the
 * type-level union below. Same-account movements — a venue's own route or
 * margin-location moves — are never reported as transfers.
 *
 * @public
 */
export type TransferActivity = BaseActivity & {
  type: ActivityType.TRANSFER
  direction: 'IN' | 'OUT'
  asset: string
  amount: string
  meta?: Record<string, unknown>
  /** Fully-resolved block-explorer URL for the on-chain transfer tx. */
  explorerLink?: string
} & (
    | { counterpartyAccountIndex: number; counterpartyAddress?: string }
    | { counterpartyAccountIndex?: number; counterpartyAddress: string }
  )

/**
 * Discriminated union of all activity records returned by a provider.
 *
 * @public
 */
export type ActivityItem =
  | DepositActivity
  | WithdrawalActivity
  | LiquidationActivity
  | FundingActivity
  | TransferActivity

/**
 * Paginated account-activity response for one provider and account.
 *
 * @public
 */
export interface ActivitiesResponse {
  provider: string
  items: ActivityItem[]
  pagination: Pagination
}

// Account configuration state — typed `AccountResponse.config`.

/**
 * Provider-specific Hyperliquid agent configuration. The record contents are
 * provider-defined and intentionally left opaque to the shared type package.
 *
 * @public
 */
export type HyperliquidAgent = Record<string, unknown>

/**
 * Hyperliquid builder-fee approval state for an account.
 *
 * @public
 */
export interface HyperliquidBuilderFeeApproval {
  builderAddress: string
  /** Basis points as a string. */
  maxFeeRate: string
  approved: boolean
}

/**
 * Hyperliquid account configuration returned in {@link AccountResponse.config}.
 *
 * @public
 */
export interface HyperliquidAccountConfig {
  provider: 'hyperliquid'
  /** `null` means abstraction has never been set. */
  abstractionMode: string | null
  agents: HyperliquidAgent[]
  builderFeeApproval?: HyperliquidBuilderFeeApproval
}

/**
 * Lighter spot-asset collateral setting for a single asset.
 *
 * @public
 */
export interface LighterAssetCollateral {
  /** Provider-native spot asset id (matches `Asset.id`). */
  assetId: string
  /** Whether this asset's balance counts toward the cross-margin collateral pool. */
  enabled: boolean
}

/**
 * Provider keys for the Lighter instances the SDK supports: mainnet
 * (`'lighter'`) and the Robinhood-chain deployment (`'lighter-rh'`). Both are
 * served by the same provider implementation and carry the same account-config
 * shape, so they discriminate the Lighter arm of {@link AccountConfig} jointly.
 *
 * @public
 */
export type LighterProviderKey = 'lighter' | 'lighter-rh'

/**
 * Lighter account configuration returned in {@link AccountResponse.config}.
 * Numeric identifiers and account modes use the provider's wire values.
 *
 * @public
 */
export interface LighterAccountConfig {
  provider: LighterProviderKey
  accountIndex: number
  /**
   * Slot of the API key the SDK holds for this address, as named by the
   * backend when it registered the key. Absent while the SDK holds no key.
   */
  apiKeyIndex?: number
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
  /** Unix seconds. Present if and only if `readOnlyTokenApproved === true`. */
  readOnlyTokenExpiry?: number
  /** Present if and only if `readOnlyTokenApproved === true`. */
  readOnlyTokenScope?: 'single' | 'all'
  /**
   * `true` if and only if LI.FI's referral code is the code currently applied
   * to the account, resolved by an SDK-direct read of the applied referral.
   * `false` when a different integrator's code (or none) is applied, or when the
   * SDK holds no referral code to compare against. Lighter referral is mutable,
   * so a `false` keeps `SET_REFERRAL` gateable — a user already on another code
   * can still switch to ours.
   */
  referralPresent: boolean
}

/**
 * Ondo account/session configuration returned in {@link AccountResponse.config}.
 * Expiry values are Unix timestamps in seconds.
 *
 * @public
 */
export interface OndoAccountConfig {
  provider: 'ondo'
  loggedIn: boolean
  /** Unix seconds. Present iff `loggedIn === true`. The token itself never appears here. */
  authTokenExpiry?: number
  /** Venue terms accepted, inferred from the login token's `newAccount` flag. Always `false` when logged out. */
  termsAccepted: boolean
  /** A venue API key is present in local storage. Local presence only — venue-side validity is not verified. */
  apiKeyRegistered: boolean
  /** A referral code (any referrer's) is already applied to the account. Always `false` when logged out. */
  referralSet: boolean
  /** Canonical Ethereum USDC deposit address, or `null` when none is provisioned. */
  depositAddress: string | null
}

/**
 * Provider-specific account configuration discriminated by its `provider` key.
 *
 * @public
 */
export type AccountConfig =
  | HyperliquidAccountConfig
  | LighterAccountConfig
  | OndoAccountConfig

/**
 * Named account-configuration value exposed to clients.
 *
 * @public
 */
export interface AccountConfigValue {
  name: string
  /** `null` means no current value — consumers fall back to the descriptor default. */
  value: string | number | boolean | null
}

/**
 * Account-configuration action and its available values, optionally including
 * whether the setting is currently satisfied.
 *
 * @public
 */
export interface AccountConfigSetting {
  type: ActionType
  values: AccountConfigValue[]
  /** `undefined` means satisfaction is tracked outside `AccountConfig` (e.g. backend `checkSetup`). */
  satisfied?: boolean
}
