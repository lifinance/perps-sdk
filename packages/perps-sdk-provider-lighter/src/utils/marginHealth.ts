import {
  addDecimalString,
  divideDecimalString,
  isDecimalStringGreaterThan,
  isDecimalStringZero,
  multiplyDecimalString,
} from '@lifi/perps-sdk'
import type { DecimalString, MarginHealth } from '@lifi/perps-types'
import type { LtAccount, LtAssetDetail } from '../types/index.js'
import { LT_MARGIN_MODE_CROSS } from '../types/index.js'
import { isAssetMarginEnabled } from './assetCollateral.js'

// Partial liquidation starts when the maintenance margin requirement exceeds
// the liquidation value (docs.lighter.xyz/trading/multi-asset-margin#health-checks).
const LIQUIDATION_THRESHOLD = '1'

/**
 * Total account liquidation value (TALT) from lighter-ts `computeLiqCollateral`:
 * each margin balance at its index price and liquidation threshold, plus the
 * unrealized PnL of the cross positions. `undefined` when a non-settlement
 * asset holds margin without an enabled margin mode, because the venue does
 * not show whether that balance counts.
 */
const calculateLiquidationValue = (
  account: LtAccount,
  assetDetails: readonly LtAssetDetail[],
  settlementAssetIndex: number
): DecimalString | undefined => {
  let value: DecimalString = '0'
  for (const asset of account.assets) {
    if (isDecimalStringZero(asset.margin_balance)) {
      continue
    }
    if (
      asset.asset_id !== settlementAssetIndex &&
      !(
        asset.margin_mode !== undefined &&
        isAssetMarginEnabled(asset.margin_mode)
      )
    ) {
      return undefined
    }
    const detail = assetDetails.find((d) => d.asset_id === asset.asset_id)
    if (detail === undefined) {
      return undefined
    }
    value = addDecimalString(
      value,
      multiplyDecimalString(
        multiplyDecimalString(asset.margin_balance, detail.index_price),
        detail.liquidation_threshold
      )
    )
  }
  for (const position of account.positions) {
    if (position.margin_mode === LT_MARGIN_MODE_CROSS) {
      value = addDecimalString(value, position.unrealized_pnl)
    }
  }
  return value
}

/**
 * Cross-margin health of one Lighter account: the venue
 * `cross_maintenance_margin_requirement` divided by the total account
 * liquidation value. The venue uses one formula for Simple and Unified
 * accounts. `undefined` for exposure without a positive liquidation value.
 */
export const calculateMarginHealth = (
  account: LtAccount,
  assetDetails: readonly LtAssetDetail[],
  settlementAssetIndex: number
): MarginHealth | undefined => {
  const maintenanceMargin = account.cross_maintenance_margin_requirement
  if (!isDecimalStringGreaterThan(maintenanceMargin, '0')) {
    return { ratio: '0', liquidationThreshold: LIQUIDATION_THRESHOLD }
  }
  const liquidationValue = calculateLiquidationValue(
    account,
    assetDetails,
    settlementAssetIndex
  )
  if (
    liquidationValue === undefined ||
    !isDecimalStringGreaterThan(liquidationValue, '0')
  ) {
    return undefined
  }
  return {
    ratio: divideDecimalString(maintenanceMargin, liquidationValue),
    liquidationThreshold: LIQUIDATION_THRESHOLD,
  }
}
