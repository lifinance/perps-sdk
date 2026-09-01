// Trade (fill) shapes returned by Lighter's `/api/v1/trades` endpoint.

/**
 * Public trade/fill row returned by Lighter's `/api/v1/trades` endpoint.
 * Size, price, and notional fields are decimal strings in market precision;
 * `timestamp` is a Unix millisecond timestamp; `transaction_time` is a Unix
 * microsecond timestamp. The optional fee fields are the side's fee *rate* as
 * an integer tick on `LIGHTER_FEE_TICK_SCALE` (1e6), not the amount charged,
 * and may be absent on older rows. A row can also carry
 * `integrator_maker_fee` or `integrator_taker_fee`: a second optional rate for
 * the same side, on the same 1e6 tick scale. The mapper adds that second rate
 * to the side's own rate.
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
  // A second fee tick that a row can carry for the same side, on the same 1e6
  // tick scale as `taker_fee` / `maker_fee`.
  integrator_taker_fee?: number
  integrator_maker_fee?: number
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
  // Per-counterparty initial-margin-fraction snapshot BEFORE the trade: the
  // leverage that counterparty had set on the market, as an integer percent on
  // `LIGHTER_IMF_PERCENT_SCALE` (`500` = 5.00% = 20x). Optional: absent on
  // older trade rows that predate the field.
  taker_initial_margin_fraction_before?: number
  maker_initial_margin_fraction_before?: number
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
