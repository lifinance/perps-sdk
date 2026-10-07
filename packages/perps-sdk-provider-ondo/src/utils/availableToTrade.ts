import {
  compareDecimalStrings,
  divideDecimalStringRoundDown,
  isDecimalStringGreaterThan,
  multiplyDecimalString,
  PerpsError,
  roundDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import type { AvailableToTrade } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoOrderSizes } from '../types/wire.js'

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

const toPositiveDecimalString = (value: string, field: string): string => {
  const decimal = unknownToDecimalString(value, field, ONDO_PROVIDER_KEY)
  if (!isDecimalStringGreaterThan(decimal, '0')) {
    throw outOfRange(field, value, 'positive')
  }
  return decimal
}

const toNonNegativeDecimalString = (value: string, field: string): string => {
  const decimal = unknownToDecimalString(value, field, ONDO_PROVIDER_KEY)
  if (compareDecimalStrings(decimal, '0') < 0) {
    throw outOfRange(field, value, 'non-negative')
  }
  return decimal
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
  const lev = toPositiveDecimalString(leverage, 'leverage.leverage')
  const mark = toPositiveDecimalString(markPrice, 'markPrice.markPrice')
  const toMargin = (baseSize: string, field: string): string =>
    roundDecimalString(
      divideDecimalStringRoundDown(
        multiplyDecimalString(
          toNonNegativeDecimalString(baseSize, field),
          mark
        ),
        lev
      ),
      20,
      'truncate'
    )
  return {
    buy: toMargin(sizes.maxBidBaseSize, 'maxOrderSize.maxBidBaseSize'),
    sell: toMargin(sizes.maxAskBaseSize, 'maxOrderSize.maxAskBaseSize'),
  }
}
