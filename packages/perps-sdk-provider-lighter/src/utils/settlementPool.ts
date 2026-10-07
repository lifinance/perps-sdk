import {
  addDecimalString,
  isDecimalStringGreaterThan,
  subtractDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'
import type { LtAccountAsset } from '../types/account.js'

/** Both routes of a unified account's settlement asset, as one holding. */
export const pooledSettlementUnits = (asset: LtAccountAsset): string =>
  addDecimalString(
    unknownToDecimalString(asset.balance, 'balance', LIGHTER_PROVIDER_KEY),
    unknownToDecimalString(
      asset.margin_balance,
      'margin_balance',
      LIGHTER_PROVIDER_KEY
    )
  )

/**
 * Spot units a unified account can spend from its settlement pool: the free
 * spot route plus the margin route up to the account's `available_balance`.
 * This is `computeSpotAvailableToTradeMarket` in Lighter's `lighter-ts` for an
 * asset priced 1:1 with a `loan_to_value` of 1. The result can be negative.
 */
export const pooledSettlementSpendable = (
  asset: LtAccountAsset,
  availableBalance: string
): string => {
  const marginBalance = unknownToDecimalString(
    asset.margin_balance,
    'margin_balance',
    LIGHTER_PROVIDER_KEY
  )
  return addDecimalString(
    subtractDecimalString(
      unknownToDecimalString(asset.balance, 'balance', LIGHTER_PROVIDER_KEY),
      unknownToDecimalString(
        asset.locked_balance,
        'locked_balance',
        LIGHTER_PROVIDER_KEY
      )
    ),
    isDecimalStringGreaterThan(marginBalance, availableBalance)
      ? availableBalance
      : marginBalance
  )
}

/** Spot-route `balance` of the collateral asset; `'0'` when the account holds none. */
export const collateralSpotBalance = (
  assets: readonly LtAccountAsset[],
  settlementAssetIndex: number
): string => {
  const asset = assets.find((a) => a.asset_id === settlementAssetIndex)
  return asset === undefined
    ? '0'
    : unknownToDecimalString(asset.balance, 'balance', LIGHTER_PROVIDER_KEY)
}
