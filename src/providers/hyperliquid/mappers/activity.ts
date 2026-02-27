import { ActivityType } from '../../../enums.js'
import type {
  ActivityItem,
  DepositActivity,
  WithdrawalActivity,
  LiquidationActivity,
  FundingActivity,
} from '../../../account.js'
import type { HlLedgerUpdate, HlFundingUpdate } from '../types.js'

/**
 * Map a Hyperliquid non-funding ledger entry to an ActivityItem.
 * Returns null for unsupported delta types (accountClassTransfer,
 * internalTransfer, subAccountTransfer, spotTransfer).
 */
export const mapLedgerEntry = (
  entry: HlLedgerUpdate,
  dexKey: string
): ActivityItem | null => {
  const { delta } = entry
  const base = {
    id: entry.hash,
    dex: dexKey,
    timestamp: new Date(entry.time).toISOString(),
  }

  switch (delta.type) {
    case 'deposit':
      return {
        ...base,
        type: ActivityType.DEPOSIT,
        amount: delta.usdc,
      } satisfies DepositActivity

    case 'withdraw':
      return {
        ...base,
        type: ActivityType.WITHDRAWAL,
        amount: delta.usdc,
        fee: (delta as { fee?: string }).fee ?? '0',
      } satisfies WithdrawalActivity

    case 'liquidation': {
      const d = delta as unknown as {
        type: string
        liquidatedNtlPos: string
        accountValue: string
        leverageType: string
        liquidatedPositions?: { coin: string; szi: string }[]
      }
      return {
        ...base,
        type: ActivityType.LIQUIDATION,
        liquidatedNotionalPosition: d.liquidatedNtlPos,
        accountValue: d.accountValue,
        leverageType: d.leverageType,
        liquidatedPositions: (d.liquidatedPositions ?? []).map((p) => ({
          symbol: p.coin,
          size: p.szi,
        })),
      } satisfies LiquidationActivity
    }

    default:
      return null
  }
}

/**
 * Map a Hyperliquid funding entry to a FundingActivity.
 */
export const mapFundingActivity = (
  entry: HlFundingUpdate,
  dexKey: string
): FundingActivity => ({
  id: entry.hash,
  dex: dexKey,
  timestamp: new Date(entry.time).toISOString(),
  type: ActivityType.FUNDING,
  symbol: entry.delta.coin,
  amount: entry.delta.usdc,
  positionSize: entry.delta.szi,
  fundingRate: entry.delta.fundingRate,
})
