// Activity history shapes returned by Lighter's REST API
// (deposits, withdrawals, funding payments, liquidations, transfers).

/**
 * Deposit history row returned by Lighter. `amount` is a decimal asset amount,
 * `timestamp` is Unix milliseconds, and `l1_tx_hash` identifies the settlement
 * transaction on the L1 bridge.
 *
 * @public
 */
export interface LtDepositHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  l1_tx_hash: string
}

/**
 * Paginated deposit-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtDepositHistoryResponse {
  code: number
  deposits: LtDepositHistoryItem[]
  cursor?: string
}

/**
 * Withdrawal history row returned by Lighter. `amount` is a decimal asset
 * amount, `timestamp` is Unix milliseconds, and `l1_tx_hash` identifies the
 * associated L1 transaction.
 *
 * @public
 */
export interface LtWithdrawHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  type: string
  l1_tx_hash: string
}

/**
 * Paginated withdrawal-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtWithdrawHistoryResponse {
  code: number
  withdraws: LtWithdrawHistoryItem[]
  cursor?: string
}

/**
 * Funding-payment history row for one perpetual position. `change`,
 * `position_size`, and `rate` are decimal strings; `timestamp` is a Unix
 * timestamp in seconds and `position_side` is Lighter's side literal.
 *
 * @public
 */
export interface LtPositionFunding {
  timestamp: number
  market_id: number
  funding_id: number
  /**
   * Signed, in quote-currency units. Positive means the account received
   * funding; negative means the account paid it. Mapped straight onto
   * `FundingActivity.amount`.
   */
  change: string
  rate: string
  position_size: string
  position_side: string
}

/**
 * Paginated position-funding response from Lighter. `next_cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtPositionFundingsResponse {
  code: number
  position_fundings: LtPositionFunding[]
  next_cursor?: string
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
  type: string
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
  liquidations: LtLiquidation[]
  next_cursor?: string
}

/**
 * Asset transfer-history row returned by Lighter. Amounts and fees are decimal
 * strings in the asset's precision; route literals identify the source and
 * destination account ledger (`spot` or `perps`).
 *
 * @public
 */
export interface LtTransfer {
  id: string
  asset_id: number
  amount: string
  fee: string
  timestamp: number
  type: string
  from_l1_address: string
  to_l1_address: string
  from_account_index: number
  to_account_index: number
  from_route: 'spot' | 'perps'
  to_route: 'spot' | 'perps'
  tx_hash: string
}

/**
 * Paginated transfer-history response from Lighter. `cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtTransferHistoryResponse {
  code: number
  transfers: LtTransfer[]
  cursor?: string
}
