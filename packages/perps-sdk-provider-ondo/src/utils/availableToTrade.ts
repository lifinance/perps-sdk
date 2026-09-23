import type { AvailableToTrade } from '@lifi/perps-types'
import type { OndoOrderSizes } from '../types/wire.js'
import { toWireBig } from './decimal.js'

/**
 * Convert one Ondo max-order-size tier from base-asset units into the margin
 * the order would lock: `baseSize × markPrice ÷ leverage`. The bid side maps
 * to `buy` and the ask side to `sell`.
 *
 * @throws {PerpsError} `SDKError` when a venue field is not a decimal.
 * @public
 */
export const ondoAvailableToTrade = (
  sizes: OndoOrderSizes,
  leverage: string,
  markPrice: string
): Pick<AvailableToTrade, 'buy' | 'sell'> => {
  const lev = toWireBig(leverage, 'leverage.leverage')
  const mark = toWireBig(markPrice, 'markPrice.markPrice')
  const toMargin = (baseSize: string, field: string): string =>
    toWireBig(baseSize, field).times(mark).div(lev).toFixed()
  return {
    buy: toMargin(sizes.maxBidBaseSize, 'maxOrderSize.maxBidBaseSize'),
    sell: toMargin(sizes.maxAskBaseSize, 'maxOrderSize.maxAskBaseSize'),
  }
}
