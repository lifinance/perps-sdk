import {
  absDecimalString,
  buildPosition,
  createWarnOnce,
  isDecimalString,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  multiplyDecimalString,
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
const warnInvalidReturnOnEquityOnce = createWarnOnce()

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

/** Map a Hyperliquid position; invalid size omits the row.
 * Funding uses the opposite venue sign. Venue ROE fractions become percents.
 * Invalid venue ROE warns once per market and uses the calculated fallback.
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
  if (
    pos.returnOnEquity !== undefined &&
    !isDecimalString(pos.returnOnEquity)
  ) {
    warnInvalidReturnOnEquityOnce(
      `${PROVIDER_KEY}|position.returnOnEquity|${market.id}`,
      `[${PROVIDER_KEY}] position \`returnOnEquity\` on market '${market.id}' is not a valid decimal, so the SDK calculates it: '${String(pos.returnOnEquity).slice(0, 64)}'`
    )
  }
  const marginMode =
    pos.leverage.type === 'cross' ? MarginMode.CROSS : MarginMode.ISOLATED

  return buildPosition({
    market,
    side: isDecimalStringGreaterThan('0', pos.szi)
      ? PositionSide.SHORT
      : PositionSide.LONG,
    size,
    entryPrice: pos.entryPx ?? '0',
    ...(markPrice === undefined ? {} : { markPrice }),
    ...(positionValue === undefined ? {} : { positionValue }),
    ...(pos.liquidationPx ? { liquidationPrice: pos.liquidationPx } : {}),
    unrealizedPnl: pos.unrealizedPnl,
    ...(isDecimalString(pos.returnOnEquity)
      ? { returnOnEquity: multiplyDecimalString(pos.returnOnEquity, '100') }
      : {}),
    ...(accruedFunding === undefined ? {} : { accruedFunding }),
    ...(leverage === undefined ? {} : { leverage }),
    marginUsed: pos.marginUsed,
    ...(initialMarginRequirement === undefined
      ? {}
      : { initialMarginRequirement }),
    marginMode,
  })
}
