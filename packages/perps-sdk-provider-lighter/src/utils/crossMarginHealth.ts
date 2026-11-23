import {
  addDecimalString,
  buildCrossMarginHealth,
  isDecimalString,
  isDecimalStringZero,
  multiplyDecimalString,
} from '@lifi/perps-sdk'
import {
  AccountMode,
  type CrossMarginHealth,
  type DecimalString,
} from '@lifi/perps-types'
import type { LtAccount, LtAssetDetail } from '../types/index.js'
import {
  LT_ACCOUNT_TRADING_MODE_UNIFIED,
  LT_MARGIN_MODE_CROSS,
} from '../types/index.js'
import { isAssetMarginEnabled } from './assetCollateral.js'

// Partial liquidation starts when the maintenance margin requirement exceeds
// the liquidation value (docs.lighter.xyz/trading/multi-asset-margin#health-checks).
const LIGHTER_LIQUIDATION_THRESHOLD = '1'

/**
 * Lighter's total account liquidation value: each margin balance at its index
 * price and liquidation threshold, plus the venue unrealized PnL of the cross
 * positions. `undefined` when an input is missing or malformed, or when a
 * non-settlement asset holds margin without an enabled margin mode.
 */
const calculateLiquidationValue = (
  account: LtAccount,
  assetDetails: readonly LtAssetDetail[],
  settlementAssetIndex: number
): DecimalString | undefined => {
  let value = '0'
  for (const asset of account.assets) {
    if (!isDecimalString(asset.margin_balance)) {
      return undefined
    }
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
    if (
      detail === undefined ||
      !isDecimalString(detail.index_price) ||
      !isDecimalString(detail.liquidation_threshold)
    ) {
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
    if (position.margin_mode !== LT_MARGIN_MODE_CROSS) {
      continue
    }
    if (!isDecimalString(position.unrealized_pnl)) {
      return undefined
    }
    value = addDecimalString(value, position.unrealized_pnl)
  }
  return value
}

/**
 * Cross-margin health of the Lighter account that the read selected. The
 * ratio is the venue `cross_maintenance_margin_requirement` divided by the
 * total account liquidation value. Without `assetDetails` the result is
 * `UNAVAILABLE`.
 */
export const buildLighterCrossMarginHealth = (
  account: LtAccount,
  assetDetails: readonly LtAssetDetail[] | undefined,
  settlementAssetIndex: number
): CrossMarginHealth =>
  buildCrossMarginHealth({
    mode:
      account.account_trading_mode === LT_ACCOUNT_TRADING_MODE_UNIFIED
        ? AccountMode.UNIFIED
        : AccountMode.SIMPLE,
    pool: { type: 'account', accountId: String(account.index) },
    liquidationThreshold: LIGHTER_LIQUIDATION_THRESHOLD,
    maintenanceMargin: account.cross_maintenance_margin_requirement,
    equity:
      assetDetails === undefined
        ? undefined
        : calculateLiquidationValue(
            account,
            assetDetails,
            settlementAssetIndex
          ),
  })
