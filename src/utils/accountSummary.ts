import type { AccountResponse, Asset, Position } from '@lifi/perps-types'
// biome-ignore lint/correctness/useImportExtensions: package subpath export
import { HlAbstractionMode } from '@lifi/perps-types/providers/hyperliquid'
import { stringToFloat } from './parse.js'

export interface AccountSummary {
  /** Total portfolio value in USD */
  portfolioValue: number
  /** Collateral available for new positions */
  availableMargin: number
  /** Margin locked in open positions */
  marginUsed: number
  /** Unrealized PnL across all positions */
  unrealizedPnl: number
}

/**
 * Build a map of coin name → USD price from spot assets and allMids.
 * Spot assets have displaySymbol "BASE/QUOTE" and assetId "@N" which keys into prices.
 */
function buildSpotCoinPrices(
  assets: Asset[],
  prices: Record<string, string>
): Map<string, number> {
  const map = new Map<string, number>()
  for (const asset of assets) {
    if (asset.market !== 'spot') {
      continue
    }
    const price = prices[asset.assetId]
    if (!price) {
      continue
    }
    const slashIdx = asset.displaySymbol.indexOf('/')
    if (slashIdx < 0) {
      continue
    }
    const base = asset.displaySymbol.slice(0, slashIdx)
    map.set(base, stringToFloat(price))
  }
  return map
}

/**
 * Resolve the USD price of a spot balance currency.
 *
 * Looks up the coin in the spot mid prices map first, then tries an exact
 * match in allMids (e.g. a perps-listed stablecoin). Falls back to $1 for
 * stablecoins with no market price entry.
 */
function getSpotPrice(
  currency: string,
  prices: Record<string, string>,
  spotCoinPrices: Map<string, number>
): number {
  const spotPrice = spotCoinPrices.get(currency)
  if (spotPrice !== undefined) {
    return spotPrice
  }
  if (prices[currency] !== undefined) {
    return stringToFloat(prices[currency])
  }
  return 1
}

const UNIFIED_STATUSES: ReadonlySet<string> = new Set([
  HlAbstractionMode.UNIFIED_ACCOUNT,
  HlAbstractionMode.PORTFOLIO_MARGIN,
])

export function calculateAccountSummary(
  account: AccountResponse,
  positions: Position[],
  prices: Record<string, string>,
  assets?: Asset[]
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  const spotCoinPrices = buildSpotCoinPrices(assets ?? [], prices)

  let spotValue = 0
  let perpsBalance = 0
  for (const [key, entries] of Object.entries(account.balances)) {
    if (key === 'spot') {
      for (const b of entries) {
        spotValue +=
          stringToFloat(b.amount) *
          getSpotPrice(b.currency, prices, spotCoinPrices)
      }
    } else {
      for (const b of entries) {
        perpsBalance += stringToFloat(b.amount)
      }
    }
  }

  const status = account.config?.abstractionStatus as string | undefined
  const isUnified = UNIFIED_STATUSES.has(status ?? '')

  // Unified: spot balances are total token holdings (margin is NOT subtracted).
  // Disabled: perps venue balances are free margin (margin IS already subtracted).
  const totalCollateral = isUnified
    ? spotValue + perpsBalance
    : spotValue + perpsBalance + marginUsed

  return {
    portfolioValue: totalCollateral + unrealizedPnl,
    availableMargin: totalCollateral - marginUsed,
    marginUsed,
    unrealizedPnl,
  }
}
