// Trade (fill) shapes returned by Lighter's `/api/v1/trades` endpoint.

/**
 * Public trade/fill row returned by Lighter's `/api/v1/trades` endpoint.
 * Size, price, and notional fields are decimal strings in market precision;
 * `timestamp` is a Unix millisecond timestamp; `transaction_time` is a Unix
 * microsecond timestamp. The optional fee fields are the side's fee *rate* on
 * Lighter's 1e6 tick scale, not the amount charged, and may be absent on older
 * rows.
 *
 * @public
 */
export type LtTrade = {
  trade_id: number
  tx_hash: string
  type: string
  market_id: number
  size: string
  price: string
  usd_amount: string
  ask_id: number
  bid_id: number
  ask_account_id: number
  bid_account_id: number
  is_maker_ask: boolean
  block_height: number
  timestamp: number
  // Lighter's OpenAPI spec marks these as required `StrictInt`, but the live
  // /api/v1/trades endpoint omits them on some `type: "trade"` rows (observed
  // on older trades) — keep optional and let the mapper emit `undefined`.
  taker_fee?: number
  maker_fee?: number
  transaction_time: number
  // Per-counterparty position snapshot BEFORE the trade is applied. Signed
  // strings: positive = long, negative = short, "0" / "0.00000" = flat.
  taker_position_size_before: string
  maker_position_size_before: string
  // Per-counterparty entry-quote (notional cost basis) snapshot BEFORE the
  // trade. Paired with `*_position_size_before`, avg entry =
  // entry_quote_before / |position_size_before|. Optional: absent on older
  // trade rows that predate the field.
  taker_entry_quote_before?: string
  maker_entry_quote_before?: string
}

/**
 * Paginated trade-history response from Lighter. `next_cursor` is an opaque
 * continuation value for the next page.
 *
 * @public
 */
export interface LtTradesResponse {
  code: number
  next_cursor: string
  trades: LtTrade[]
}
