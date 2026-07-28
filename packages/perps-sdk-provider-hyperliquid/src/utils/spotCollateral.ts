import type { Balance } from '@lifi/perps-types'

/**
 * Portfolio-margin collateral beyond the category quote assets, keyed by spot
 * display symbol with its loan-to-value weight. Hyperliquid credits these
 * toward buying power at the given fraction (0.5 for both today). Quote assets
 * (USDC/USDT) are already full-value collateral via the category model, so
 * they are not listed here.
 * https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin
 */
const PORTFOLIO_MARGIN_LTV: Readonly<Record<string, number>> = {
  HYPE: 0.5,
  UBTC: 0.5,
}

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
 * Partition spot balances into collateral and ordinary holdings. Quote assets
 * are full-value collateral; portfolio-margin-supported assets retain their
 * LTV as `collateralWeight`.
 * @public
 */
export const partitionSpotBalances = (
  spotBalances: readonly Balance[],
  quoteAssetIds: ReadonlySet<string>,
  portfolioMargin: boolean
): SpotPartition => {
  const collateralBalances: Balance[] = []
  const balances: Balance[] = []
  for (const balance of spotBalances) {
    if (quoteAssetIds.has(balance.asset.id)) {
      collateralBalances.push(balance)
      continue
    }
    const ltv = portfolioMargin
      ? PORTFOLIO_MARGIN_LTV[balance.asset.displaySymbol]
      : undefined
    if (ltv !== undefined) {
      collateralBalances.push({ ...balance, collateralWeight: ltv })
    } else {
      balances.push(balance)
    }
  }
  return { collateralBalances, balances }
}
