import type { Address } from './typedData.js'
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
  /**
   * Per-provider account state, strongly typed and discriminated on
   * `config.provider`. Consumers narrow with `config.provider === 'hyperliquid'`
   * etc. to get access to the provider-specific fields. There is no untyped
   * escape hatch — fields specific to a future provider belong on a new
   * variant of `AccountConfig`, not on a generic `Record<string, unknown>`.
   */
  config: AccountConfig
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

// ---------------------------------------------------------------------------
// Account configuration state — typed `AccountResponse.config`
// ---------------------------------------------------------------------------

/**
 * Hyperliquid record describing one authorised agent wallet on the
 * `userExtraAgents` response. Shape mirrors what the Hyperliquid info API
 * returns; the backend forwards the entries verbatim. The widget renders the
 * count / expiry on the `APPROVE_AGENT` setup descriptor.
 */
export type HyperliquidAgent = Record<string, unknown>

/**
 * Hyperliquid builder-fee approval state. Surfaced by the backend after
 * comparing the user's `maxBuilderFee` against the configured LI.FI builder
 * fee for this dex. The widget uses `approved: false` to badge
 * `APPROVE_BUILDER_FEE` as outstanding.
 */
export interface HyperliquidBuilderFeeApproval {
  builderAddress: string
  /** Maximum fee rate the user must approve, in basis points as a string. */
  maxFeeRate: string
  approved: boolean
}

/**
 * Hyperliquid-specific account configuration state.
 *
 * `abstractionMode: null` means abstraction has never been set; consumers
 * should fall back to the descriptor's `default` `ParamOption`.
 *
 * `builderFeeApproval` is absent when no builder is configured for this
 * provider; when present, `approved` reports whether the user has signed the
 * maximum builder fee.
 */
export interface HyperliquidAccountConfig {
  provider: 'hyperliquid'
  abstractionMode: string | null
  agents: HyperliquidAgent[]
  builderFeeApproval?: HyperliquidBuilderFeeApproval
}

/**
 * Lighter-specific account configuration state.
 *
 * `accountIndex` is the L2 integer account identifier.
 *
 * `apiKeyRegistered` reports whether a key is currently live in the
 * `apiKeyIndex` slot; the `REGISTER_API_KEY` setup descriptor gates trading
 * on this.
 *
 * `accountType` is the raw integer fee/latency tier from Lighter's
 * `/api/v1/account.account_type` — decoding to a human label is left to the
 * consumer.
 */
export interface LighterAccountConfig {
  provider: 'lighter'
  accountIndex: number
  apiKeyIndex: number
  apiKeyRegistered: boolean
  accountType: number
}

/**
 * Discriminated union of per-provider account configuration state.
 * Narrow with `config.provider === '<key>'` to access provider-specific
 * fields. Adding a new provider means adding a new variant, NOT widening
 * to a record-keyed shape.
 */
export type AccountConfig = HyperliquidAccountConfig | LighterAccountConfig

/**
 * The current value of a single descriptor parameter, as projected by the
 * SDK from the typed `AccountConfig` for widget consumption.
 *
 * `name` matches `Param.name` on the descriptor that produced it; `value`
 * is the current state in the primitive shape the descriptor declared.
 * `null` indicates "no current value" (the user has not made a selection
 * yet, or the provider has not surfaced one), and the widget should fall
 * back to the descriptor's `default` `ParamOption` (when present) or
 * render the control with no highlight.
 */
export interface AccountConfigValue {
  name: string
  value: string | number | boolean | null
}

/**
 * SDK projection of `AccountConfig` against a single descriptor — one
 * `AccountConfigSetting` per descriptor on `Provider.setup` /
 * `Provider.options`. `values` carries the current state for each `Param`
 * the descriptor declared.
 *
 * Consumers must NOT read `AccountConfig` directly — narrow through this
 * projection so a new provider variant doesn't require widget changes.
 */
export interface AccountConfigSetting {
  type: ActionType
  values: AccountConfigValue[]
}
