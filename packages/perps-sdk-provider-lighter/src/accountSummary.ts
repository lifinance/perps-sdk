import { stringToFloat } from '@lifi/perps-sdk'
import type {
  AccountResponse,
  AccountSummary,
  Asset,
  Position,
} from '@lifi/perps-types'

/**
 * Lighter account roll-up. Lighter has no abstraction-mode equivalent;
 * `availableMargin` is the USDC collateral minus margin already locked.
 * Spot balances on Lighter today are token amounts without USD pricing
 * symmetric to Hyperliquid's spot orderbooks; they contribute their raw
 * dollar amount via the `prices` map when present, otherwise are ignored.
 */
export function summarizeLighterAccount(
  account: AccountResponse,
  positions: Position[],
  prices: Record<string, string>,
  _assets?: Asset[],
  _collateralCurrencies?: ReadonlySet<string>
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  let collateral = 0
  let spotValue = 0
  for (const [key, entries] of Object.entries(account.balances)) {
    if (key === 'spot') {
      for (const b of entries) {
        const price =
          prices[b.currency] !== undefined
            ? stringToFloat(prices[b.currency])
            : 0
        spotValue += stringToFloat(b.amount) * price
      }
    } else {
      for (const b of entries) {
        collateral += stringToFloat(b.amount)
      }
    }
  }

  return {
    portfolioValue: collateral + spotValue + unrealizedPnl,
    availableMargin: collateral - marginUsed,
    marginUsed,
    unrealizedPnl,
    collateralGrouping: 'perMarket',
  }
}
