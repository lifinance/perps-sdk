import {
  asDecimalString,
  isDecimalStringZero,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'
import type { HlAssetPosition } from '../types/index.js'

const skipPosition = (field: string, value: unknown): undefined => {
  warnSkippedVenueRow(PROVIDER_KEY, 'position', field, value)
  return undefined
}

/**
 * True when the assetPosition has non-zero size. Hyperliquid keeps zero-size
 * rows in clearinghouse states after a close; both the REST and WS positions
 * paths drop them so a close surfaces as absence from the open set.
 * @public
 */
export const isOpenAssetPosition = (ap: HlAssetPosition): boolean =>
  !isDecimalStringZero(ap.position.szi)

/**
 * Map a non-zero Hyperliquid position payload to the SDK's normalized
 * position. Signed wire size determines side; decimal strings remain strings
 * in the normalized response. `cumFunding.sinceOpen` is negated because
 * Hyperliquid signs funding paid as positive and `accruedFunding` signs it as
 * negative. A row with an invalid size, position value, leverage or funding
 * gives `undefined`.
 * @public
 */
export const mapPosition = (
  ap: HlAssetPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  const pos = ap.position
  const sziDecimal = asDecimalString(pos.szi)
  if (sziDecimal === undefined) {
    return skipPosition('szi', pos.szi)
  }
  const positionValueDecimal = asDecimalString(pos.positionValue)
  if (positionValueDecimal === undefined) {
    return skipPosition('positionValue', pos.positionValue)
  }
  const leverageDecimal = asDecimalString(pos.leverage.value)
  if (leverageDecimal === undefined || new Big(leverageDecimal).lte(0)) {
    return skipPosition('leverage.value', pos.leverage.value)
  }
  const cumFunding = asDecimalString(pos.cumFunding.sinceOpen)
  if (cumFunding === undefined) {
    return skipPosition('cumFunding.sinceOpen', pos.cumFunding.sinceOpen)
  }
  const szi = new Big(sziDecimal)
  const positionValue = new Big(positionValueDecimal).abs()
  const leverage = new Big(leverageDecimal)
  const marginMode =
    pos.leverage.type === 'cross' ? MarginMode.CROSS : MarginMode.ISOLATED

  return {
    market,
    side: szi.gte(0) ? PositionSide.LONG : PositionSide.SHORT,
    size: szi.abs().toFixed(),
    entryPrice: pos.entryPx ?? '0',
    markPrice: szi.eq(0) ? '0' : positionValue.div(szi.abs()).toFixed(),
    liquidationPrice: pos.liquidationPx ?? '0',
    unrealizedPnl: pos.unrealizedPnl,
    accruedFunding: new Big(cumFunding).neg().toFixed(),
    leverage: ap.position.leverage.value,
    marginUsed: pos.marginUsed,
    initialMarginRequirement: positionValue.div(leverage).toFixed(),
    marginMode,
  }
}
