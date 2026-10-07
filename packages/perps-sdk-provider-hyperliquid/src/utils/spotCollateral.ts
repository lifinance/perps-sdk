import { requireVenueDecimal } from '@lifi/perps-sdk'
import type { Balance } from '@lifi/perps-types'
import Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'

/**
 * Result of {@link partitionSpotBalances}: balances that count toward
 * collateral and balances treated as ordinary holdings.
 * @public
 */
export interface SpotPartition {
  collateralBalances: Balance[]
  balances: Balance[]
}

/**
 * Partition spot balances into collateral and ordinary holdings. Category
 * quote assets are collateral; every other token is an ordinary holding.
 * Zero-unit rows are dropped from both lists.
 * @public
 */
export const partitionSpotBalances = (
  spotBalances: readonly Balance[],
  quoteAssetIds: ReadonlySet<string>
): SpotPartition => {
  const collateralBalances: Balance[] = []
  const balances: Balance[] = []
  for (const balance of spotBalances) {
    if (
      !new Big(
        requireVenueDecimal(balance.units, 'spotBalance.units', PROVIDER_KEY)
      ).gt(0)
    ) {
      continue
    }
    if (quoteAssetIds.has(balance.asset.id)) {
      collateralBalances.push(balance)
    } else {
      balances.push(balance)
    }
  }
  return { collateralBalances, balances }
}
