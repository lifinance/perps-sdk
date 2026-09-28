import { PerpsError } from '@lifi/perps-sdk'
import type { AvailableToTrade } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoOrderSizes } from '../types/wire.js'
import { toWireBig } from './decimal.js'

// A max amount must never exceed the exact cap, so the division truncates.
const TruncatingBig = Big()
TruncatingBig.RM = Big.roundDown

const outOfRange = (
  field: string,
  value: string,
  bound: string
): PerpsError => {
  const error = new PerpsError(
    PerpsErrorCode.SDKError,
    `Ondo field \`${field}\` must be ${bound}: '${value}'`
  )
  error.tool = ONDO_PROVIDER_KEY
  return error
}

const toPositiveBig = (value: string, field: string): Big => {
  const parsed = toWireBig(value, field)
  if (parsed.lte(0)) {
    throw outOfRange(field, value, 'positive')
  }
  return parsed
}

const toNonNegativeBig = (value: string, field: string): Big => {
  const parsed = toWireBig(value, field)
  if (parsed.lt(0)) {
    throw outOfRange(field, value, 'non-negative')
  }
  return parsed
}

/**
 * Convert one Ondo max-order-size tier from base-asset units into the margin
 * the order would lock: `baseSize × markPrice ÷ leverage`, truncated toward
 * zero at 20 decimal places. The bid side maps to `buy` and the ask side to
 * `sell`.
 *
 * @throws {PerpsError} `SDKError` when a venue field is not a decimal, a size
 *   is negative, or the leverage or mark price is not positive.
 * @public
 */
export const ondoAvailableToTrade = (
  sizes: OndoOrderSizes,
  leverage: string,
  markPrice: string
): Pick<AvailableToTrade, 'buy' | 'sell'> => {
  const lev = toPositiveBig(leverage, 'leverage.leverage')
  const mark = toPositiveBig(markPrice, 'markPrice.markPrice')
  const toMargin = (baseSize: string, field: string): string =>
    new TruncatingBig(toNonNegativeBig(baseSize, field))
      .times(mark)
      .div(lev)
      .toFixed()
  return {
    buy: toMargin(sizes.maxBidBaseSize, 'maxOrderSize.maxBidBaseSize'),
    sell: toMargin(sizes.maxAskBaseSize, 'maxOrderSize.maxAskBaseSize'),
  }
}
