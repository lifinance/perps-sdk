// Lighter submit/execute-path wire shapes (sendTx, fastwithdraw, changeAccountTier).

/**
 * Request body for Lighter's `/api/v1/sendTx` endpoint. `tx_type` and
 * `tx_info` are the signed WASM transaction envelope; `price_protection` is an
 * optional venue-side execution guard.
 *
 * @public
 */
export interface LtSendTxRequest {
  tx_type: number
  tx_info: string
  price_protection?: boolean
}

/**
 * Response from Lighter's `/api/v1/sendTx` endpoint. `tx_hash` identifies the
 * submitted transaction; timing and quota fields are optional venue estimates.
 *
 * @public
 */
export interface LtSendTxResponse {
  code: number
  message: string
  tx_hash: string
  predicted_execution_time_ms?: number
  volume_quota_remaining?: number
}

/**
 * Batch request body for Lighter's transaction submission endpoint.
 * `tx_types` is a JSON-encoded number array and `tx_infos` a JSON-encoded
 * string array; corresponding entries are submitted in array order.
 *
 * @public
 */
export interface LtSendTxBatchRequest {
  tx_types: string // JSON-encoded number[]
  tx_infos: string // JSON-encoded string[]
}

/**
 * Batch submission response from Lighter. Each `tx_hash` corresponds to the
 * transaction at the same index in the submitted batch.
 *
 * @public
 */
export interface LtSendTxBatchResponse {
  code: number
  message: string
  tx_hash: string[] // one hash per submitted tx, indexed by submission order
  predicted_execution_time_ms?: number
  volume_quota_remaining?: number
}

/**
 * `GET /api/v1/fastwithdraw/info` (Lighter `RespGetFastwithdrawalInfo`).
 *
 * Probe response that tells the caller whether the fast-withdraw operator is
 * accepting transfers from `account_index` and, if so, which operator account
 * to send the signed L2 transfer to. `withdraw_limit` and
 * `max_withdrawal_amount` are USDC strings in **L2 6-decimal scale**, matching
 * the `usdc_amount` units the WASM `SignTransfer` consumes. Lighter signals
 * "fast path is not available right now" with a non-success `code` AND/OR a
 * missing `to_account_index` (a `0` is also treated as missing because account
 * index 0 is reserved by the protocol and never an operator).
 *
 * @public
 */
export interface LtFastwithdrawInfoResponse {
  code: number
  message?: string
  to_account_index: number
  withdraw_limit: string
  max_withdrawal_amount: string
}

/**
 * `POST /api/v1/fastwithdraw` (Lighter `ResultCode`).
 *
 * Returns only `{code, message}` — no `tx_hash`, unlike `/sendTx`. The Lighter
 * relayer drains the operator account back to the user's L1 address
 * out-of-band; success here means the signed L2 transfer was accepted, not
 * that L1 settlement is complete.
 *
 * @public
 */
export interface LtFastwithdrawResponse {
  code: number
  message?: string
}

/**
 * `POST /api/v1/changeAccountTier` (Lighter `RespChangeAccountTier`).
 *
 * Code 0 means Lighter accepted the tier change; any other code carries a
 * Lighter-defined business-rule rejection (open positions, pending orders, 24h
 * cooldown, etc.) and `message` is the operator-readable reason.
 *
 * @public
 */
export interface LtChangeAccountTierResponse {
  code: number
  message?: string
}
