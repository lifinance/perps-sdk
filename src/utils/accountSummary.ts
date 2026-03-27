import type { AccountResponse, Position } from '@lifi/perps-types'
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

function getSpotPrice(
  currency: string,
  prices: Record<string, string>
): number | null {
  if (currency === 'USDC') {
    return 1
  }
  const prefix = `${currency}:`
  for (const key of Object.keys(prices)) {
    if (key.startsWith(prefix)) {
      return stringToFloat(prices[key]!)
    }
  }
  return null
}

const UNIFIED_STATUSES: ReadonlySet<string> = new Set([
  HlAbstractionMode.UNIFIED_ACCOUNT,
  HlAbstractionMode.PORTFOLIO_MARGIN,
])

export function calculateAccountSummary(
  account: AccountResponse,
  positions: Position[],
  prices: Record<string, string>
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of positions) {
    marginUsed += stringToFloat(p.marginUsed)
    unrealizedPnl += stringToFloat(p.unrealizedPnl)
  }

  let spotValue = 0
  let perpsBalance = 0
  for (const [key, entries] of Object.entries(account.balances)) {
    if (key === 'spot') {
      for (const b of entries) {
        const price = getSpotPrice(b.currency, prices)
        if (price !== null) {
          spotValue += stringToFloat(b.amount) * price
        }
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
