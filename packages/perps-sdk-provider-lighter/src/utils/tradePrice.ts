import {
  safeDivideDecimalString,
  safeIsDecimalStringZero,
} from '@lifi/perps-sdk'
import type { LtTrade } from '../types/index.js'

/**
 * Execution price of a Lighter trade row. Lighter reports a zero `price` on a
 * `deleverage` row, but `usd_amount` still carries the execution notional, so
 * that row resolves to `usd_amount / size`. Every other row, and a row whose
 * division fails, keeps the venue `price`.
 *
 * @internal
 */
export const resolveTradePrice = (
  trade: Pick<LtTrade, 'type' | 'price' | 'size' | 'usd_amount'>
): string =>
  trade.type === 'deleverage' && safeIsDecimalStringZero(trade.price) === true
    ? (safeDivideDecimalString(trade.usd_amount, trade.size) ?? trade.price)
    : trade.price
