import { ActivityType } from '../../../enums.js'
import type {
  ActivityItem,
  DepositActivity,
  WithdrawalActivity,
  LiquidationActivity,
  FundingActivity,
  TransferActivity,
} from '../../../account.js'
import { isSpotTransferDelta } from '../types.js'
import type { HlLedgerUpdate, HlFundingUpdate } from '../types.js'

/**
 * Map a Hyperliquid non-funding ledger entry to an ActivityItem.
 *
 * Direction for `spotTransfer` is derived from `queriedAddress`: if it
 * matches the delta's `user`, the queried account is the sender (`OUT`);
 * if it matches `destination`, it's the recipient (`IN`).
 *
 * Returns null for currently-unsupported delta types
 * (accountClassTransfer, internalTransfer, subAccountTransfer).
 */
export const mapLedgerEntry = (
  entry: HlLedgerUpdate,
  providerKey: string,
  queriedAddress: string
): ActivityItem | null => {
  const { delta } = entry
  const base = {
    id: entry.hash,
    provider: providerKey,
    timestamp: new Date(entry.time).toISOString(),
  }

  // `spotTransfer` is handled before the switch because the catch-all arm of
  // `HlLedgerDelta` (`{ type: string; [key: string]: unknown }`) is a
  // structural supertype, so switching on `delta.type` cannot narrow to the
  // concrete `HlSpotTransferDelta`. The user-defined type guard does narrow.
  if (isSpotTransferDelta(delta)) {
    const queried = queriedAddress.toLowerCase()
    const sender = delta.user.toLowerCase()
    const recipient = delta.destination.toLowerCase()
    const direction: 'IN' | 'OUT' = queried === sender ? 'OUT' : 'IN'
    const counterpartyAddress = direction === 'OUT' ? recipient : sender
    const meta: Record<string, unknown> = {
      transferType: 'spotTransfer',
    }
    if (delta.usdcValue !== undefined) {
      meta.usdcValue = delta.usdcValue
    }
    if (delta.fee !== undefined) {
      meta.fee = delta.fee
    }
    if (delta.nativeTokenFee !== undefined) {
      meta.nativeTokenFee = delta.nativeTokenFee
    }
    if (delta.nonce !== undefined) {
      meta.nonce = delta.nonce
    }
    return {
      ...base,
      type: ActivityType.TRANSFER,
      direction,
      counterpartyAddress,
      asset: delta.token,
      amount: delta.amount,
      meta,
    } satisfies TransferActivity
  }

  switch (delta.type) {
    case 'deposit':
      return {
        ...base,
        type: ActivityType.DEPOSIT,
        amount: delta.usdc ?? '0',
      } satisfies DepositActivity

    case 'withdraw':
      return {
        ...base,
        type: ActivityType.WITHDRAWAL,
        amount: delta.usdc ?? '0',
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
          asset: {
            assetId: p.coin,
            market: '',
            displaySymbol: p.coin,
            displayQuote: null,
          },
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
  providerKey: string
): FundingActivity => ({
  id: entry.hash,
  provider: providerKey,
  timestamp: new Date(entry.time).toISOString(),
  type: ActivityType.FUNDING,
  asset: {
    assetId: entry.delta.coin,
    market: '',
    displaySymbol: entry.delta.coin,
    displayQuote: null,
  },
  amount: entry.delta.usdc,
  positionSize: entry.delta.szi,
  fundingRate: entry.delta.fundingRate,
})
