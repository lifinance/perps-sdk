import {
  absDecimalString,
  createWarnOnce,
  isDecimalString,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  safeAbsDecimalString,
  safeDivideDecimalString,
  safeIsDecimalStringZero,
  safeNumberToDecimalString,
  safeSubtractDecimalString,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import type { PerpsMarketDisplay, Position } from '@lifi/perps-types'
import { MarginMode, PositionSide } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HlAssetPosition } from '../types/index.js'

const warnNonPositiveLeverageOnce = createWarnOnce()

const skipPosition = (
  marketId: string,
  field: string,
  value: unknown
): undefined => {
  warnSkippedVenueRow(PROVIDER_KEY, 'position', field, value, { marketId })
  return undefined
}

/**
 * True when the assetPosition has non-zero size. Hyperliquid keeps zero-size
 * rows in clearinghouse states after a close; both the REST and WS positions
 * paths drop them so a close surfaces as absence from the open set.
 * @public
 */
export const isOpenAssetPosition = (ap: HlAssetPosition): boolean =>
  safeIsDecimalStringZero(ap.position.szi) !== true

/**
 * Map a non-zero Hyperliquid position payload to the SDK's normalized
 * position. Signed wire size determines side; decimal strings remain strings
 * in the normalized response. `cumFunding.sinceOpen` is negated because
 * Hyperliquid signs funding paid as positive and `accruedFunding` signs it as
 * negative. A row with an invalid size gives `undefined`; an invalid position
 * value, a non-positive leverage or an invalid funding leaves the derived field
 * absent.
 * @public
 */
export const mapPosition = (
  ap: HlAssetPosition,
  market: PerpsMarketDisplay
): Position | undefined => {
  const pos = ap.position
  if (!isDecimalString(pos.szi)) {
    return skipPosition(market.id, 'szi', pos.szi)
  }
  const size = absDecimalString(pos.szi)
  const positionValue = safeAbsDecimalString(pos.positionValue)
  const markPrice =
    positionValue === undefined
      ? undefined
      : isDecimalStringZero(size)
        ? '0'
        : safeDivideDecimalString(positionValue, size)
  const accruedFunding = safeSubtractDecimalString(
    '0',
    pos.cumFunding.sinceOpen
  )
  const venueLeverage = safeNumberToDecimalString(pos.leverage.value)
  const leverage =
    venueLeverage !== undefined &&
    isDecimalStringGreaterThan(venueLeverage, '0')
      ? venueLeverage
      : undefined
  if (venueLeverage !== undefined && leverage === undefined) {
    warnNonPositiveLeverageOnce(
      venueLeverage,
      `[${PROVIDER_KEY}] position \`leverage.value\` is not positive: '${venueLeverage}'`
    )
  }
  const initialMarginRequirement =
    positionValue === undefined || leverage === undefined
      ? undefined
      : safeDivideDecimalString(positionValue, leverage)
  const marginMode =
    pos.leverage.type === 'cross' ? MarginMode.CROSS : MarginMode.ISOLATED

  return {
    market,
    side: isDecimalStringGreaterThan('0', pos.szi)
      ? PositionSide.SHORT
      : PositionSide.LONG,
    size,
    entryPrice: pos.entryPx ?? '0',
    ...(markPrice === undefined ? {} : { markPrice }),
    liquidationPrice: pos.liquidationPx || '0',
    unrealizedPnl: pos.unrealizedPnl,
    ...(accruedFunding === undefined ? {} : { accruedFunding }),
    ...(leverage === undefined ? {} : { leverage }),
    marginUsed: pos.marginUsed,
    ...(initialMarginRequirement === undefined
      ? {}
      : { initialMarginRequirement }),
    marginMode,
  }
}
