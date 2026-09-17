// Activity history shapes returned by Lighter's REST API
// (deposits, withdrawals, funding payments, liquidations, transfers).
// Lighter serializes an empty list as JSON `null`, so list members are nullable.

import type { DepositHistoryItem } from 'zklighter-perps/models/DepositHistoryItem'
import type { LiqTrade } from 'zklighter-perps/models/LiqTrade'
import type { LiquidationTypeEnum } from 'zklighter-perps/models/Liquidation'
import type { PositionFunding } from 'zklighter-perps/models/PositionFunding'
import type { TransferHistoryItem } from 'zklighter-perps/models/TransferHistoryItem'
import type { WithdrawHistoryItem } from 'zklighter-perps/models/WithdrawHistoryItem'
import type { LtAccountPosition } from './account.js'

/**
 * Deposit history row returned by Lighter. `amount` is a decimal asset amount,
 * `timestamp` is Unix milliseconds, and `l1_tx_hash` identifies the settlement
 * transaction on the L1 bridge.
 *
 * @public
 */
export type LtDepositHistoryItem = DepositHistoryItem

/**
 * Paginated deposit-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtDepositHistoryResponse {
  code: number
  deposits: LtDepositHistoryItem[] | null
  cursor?: string
}

/**
 * Withdrawal history row returned by Lighter. `amount` is a decimal asset
 * amount, `timestamp` is Unix milliseconds, and `l1_tx_hash` identifies the
 * associated L1 transaction.
 *
 * @public
 */
export type LtWithdrawHistoryItem = WithdrawHistoryItem

/**
 * Paginated withdrawal-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtWithdrawHistoryResponse {
  code: number
  withdraws: LtWithdrawHistoryItem[] | null
  cursor?: string
}

/**
 * Funding-payment history row for one perpetual position. `change`,
 * `position_size`, `rate` and `discount` are decimal strings; `timestamp` is a
 * Unix timestamp in seconds. `change` is signed in quote-currency units:
 * positive means the account received funding and negative means it paid.
 *
 * @public
 */
export type LtPositionFunding = PositionFunding

/**
 * Paginated position-funding response from Lighter. `next_cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtPositionFundingsResponse {
  code: number
  position_fundings: LtPositionFunding[] | null
  next_cursor?: string
}

/**
 * Venue liquidation type Lighter reports on a liquidation row. A margin mode
 * is a separate value carried on the row's position.
 *
 * @public
 */
export type LtLiquidationType = LiquidationTypeEnum

/**
 * Forced trade Lighter executed to close the liquidated position. Prices,
 * sizes and fees are decimal strings in the market's native precision.
 * `transaction_time` is a Unix microsecond timestamp, while the enclosing
 * row's `executed_at` is milliseconds.
 *
 * @public
 */
export type LtLiqTrade = LiqTrade

/**
 * Position row inside a liquidation payload. Lighter returns the full
 * `AccountPosition` shape here; the SDK models only the members the
 * liquidation mapper reads.
 *
 * @public
 */
export type LtLiquidationPosition = Pick<
  LtAccountPosition,
  'market_id' | 'margin_mode'
>

/**
 * Account snapshot Lighter attaches to a liquidation row. `risk_info_before`
 * is the pre-trade state that breached maintenance margin. Lighter also
 * reports the settled risk info, mark prices, assets and asset index prices
 * here; the SDK models only the members the liquidation mapper reads.
 *
 * @public
 */
export interface LtLiquidationInfo {
  positions: LtLiquidationPosition[] | null
  risk_info_before: {
    // Lighter's OpenAPI does not require this member, so an account without
    // cross exposure may omit it.
    cross_risk_parameters?: {
      /** Account equity as a decimal string, in quote-currency units. */
      total_account_value: string
    }
  }
}

/**
 * Liquidation event row returned by Lighter. `executed_at` is a Unix timestamp
 * in milliseconds.
 *
 * @public
 */
export interface LtLiquidation {
  id: number
  market_id: number
  type: LtLiquidationType
  trade: LtLiqTrade
  info: LtLiquidationInfo
  executed_at: number
}

/**
 * Paginated liquidation-history response from Lighter. `next_cursor` is an
 * opaque continuation value for the next page.
 *
 * @public
 */
export interface LtLiquidationsResponse {
  code: number
  liquidations: LtLiquidation[] | null
  next_cursor?: string
}

/**
 * Asset transfer-history row returned by Lighter. `amount` is a decimal string
 * in the precision of the asset the row moves; `fee` is a decimal string in the
 * precision of the deployment's settlement asset. Route literals identify the
 * source and destination account ledger (`spot` or `perps`).
 *
 * @public
 */
export type LtTransfer = TransferHistoryItem

/**
 * Paginated transfer-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtTransferHistoryResponse {
  code: number
  transfers: LtTransfer[] | null
  cursor?: string
}
