import type { AccountResponse } from '@lifi/perps-types'

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
      return parseFloat(prices[key]!)
    }
  }
  return null
}

const UNIFIED_STATUSES = new Set([
  'unified',
  'unifiedAccount',
  'portfolioMargin',
])

export function calculateAccountSummary(
  account: AccountResponse,
  prices: Record<string, string>
): AccountSummary {
  let marginUsed = 0
  let unrealizedPnl = 0
  for (const p of account.positions) {
    marginUsed += parseFloat(p.marginUsed)
    unrealizedPnl += parseFloat(p.unrealizedPnl)
  }

  let spotValue = 0
  let perpsBalance = 0
  for (const [key, entries] of Object.entries(account.balances)) {
    if (key === 'spot') {
      for (const b of entries) {
        const price = getSpotPrice(b.currency, prices)
        if (price !== null) {
          spotValue += parseFloat(b.amount) * price
        }
      }
    } else {
      for (const b of entries) {
        perpsBalance += parseFloat(b.amount)
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
