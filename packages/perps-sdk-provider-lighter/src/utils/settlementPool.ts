import type Big from 'big.js'
import type { LtAccountAsset } from '../types/account.js'
import { toRequiredBig } from './decimal.js'

/** Both routes of a unified account's settlement asset, as one holding. */
export const pooledSettlementUnits = (asset: LtAccountAsset): Big =>
  toRequiredBig(asset.balance, 'balance').plus(
    toRequiredBig(asset.margin_balance, 'margin_balance')
  )

/**
 * Spot units a unified account can spend from its settlement pool: the free
 * spot route plus the margin route up to the account's `available_balance`.
 * This is `computeSpotAvailableToTradeMarket` in Lighter's `lighter-ts` for an
 * asset priced 1:1 with a `loan_to_value` of 1. The result can be negative.
 */
export const pooledSettlementSpendable = (
  asset: LtAccountAsset,
  availableBalance: Big
): Big => {
  const marginBalance = toRequiredBig(asset.margin_balance, 'margin_balance')
  return toRequiredBig(asset.balance, 'balance')
    .minus(toRequiredBig(asset.locked_balance, 'locked_balance'))
    .plus(marginBalance.lt(availableBalance) ? marginBalance : availableBalance)
}

/** Spot-route `balance` of the collateral asset; `'0'` when the account holds none. */
export const collateralSpotBalance = (
  assets: readonly LtAccountAsset[],
  settlementAssetIndex: number
): string => {
  const asset = assets.find((a) => a.asset_id === settlementAssetIndex)
  return asset === undefined
    ? '0'
    : toRequiredBig(asset.balance, 'balance').toFixed()
}
