// Activity history shapes returned by Lighter's REST API
// (deposits, withdrawals, funding payments, liquidations, transfers).

/** @public */
export interface LtDepositHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  l1_tx_hash: string
}

/** @public */
export interface LtDepositHistoryResponse {
  code: number
  deposits: LtDepositHistoryItem[]
  cursor?: string
}

/** @public */
export interface LtWithdrawHistoryItem {
  id: string
  asset_id: number
  amount: string
  timestamp: number
  status: string
  type: string
  l1_tx_hash: string
}

/** @public */
export interface LtWithdrawHistoryResponse {
  code: number
  withdraws: LtWithdrawHistoryItem[]
  cursor?: string
}

/** @public */
export interface LtPositionFunding {
  timestamp: number
  market_id: number
  funding_id: number
  change: string
  rate: string
  position_size: string
  position_side: string
}

/** @public */
export interface LtPositionFundingsResponse {
  code: number
  position_fundings: LtPositionFunding[]
  next_cursor?: string
}

/** @public */
export interface LtLiquidation {
  id: number
  market_id: number
  type: string
  executed_at: number
}

/** @public */
export interface LtLiquidationsResponse {
  code: number
  liquidations: LtLiquidation[]
  next_cursor?: string
}

/** @public */
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

/** @public */
export interface LtTransferHistoryResponse {
  code: number
  transfers: LtTransfer[]
  cursor?: string
}
