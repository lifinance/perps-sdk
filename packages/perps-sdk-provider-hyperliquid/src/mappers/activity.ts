import type {
  ActivityItem,
  DepositActivity,
  FundingActivity,
  LiquidationActivity,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import type {
  HlFundingUpdate,
  HlLedgerUpdate,
} from '@lifi/perps-types/providers/hyperliquid'
import {
  isSendAssetDelta,
  isSpotTransferDelta,
} from '@lifi/perps-types/providers/hyperliquid'
import { deriveMarket } from './_market.js'

/**
 * Map a Hyperliquid non-funding ledger entry to an ActivityItem.
 *
 * Direction for `spotTransfer` and `sendAsset` is derived from
 * `queriedAddress` matching the delta's `user` (OUT) or `destination` (IN).
 * Returns null for unsupported delta types and for same-user `sendAsset`
 * dex moves (where `user === destination === queriedAddress`).
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

  // Handled before the switch: the catch-all arm of `HlLedgerDelta` is a
  // structural supertype of the concrete delta, so a `switch (delta.type)`
  // cannot narrow off the discriminant. The user-defined type guard does.
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

  // `sendAsset` (wire `type === 'send'`) covers cross-user transfers
  // (modelled as TRANSFER) and same-user dex moves (returned as null —
  // overloading TRANSFER for those would lie about direction). Pre-switch
  // narrowing for the same reason as spotTransfer.
  if (isSendAssetDelta(delta)) {
    const queried = queriedAddress.toLowerCase()
    const sender = delta.user.toLowerCase()
    const recipient = delta.destination.toLowerCase()

    if (sender === recipient && sender === queried) {
      return null
    }

    const direction: 'IN' | 'OUT' = queried === sender ? 'OUT' : 'IN'
    const counterpartyAddress = direction === 'OUT' ? recipient : sender
    const meta: Record<string, unknown> = {
      transferType: 'sendAsset',
      sourceDex: delta.sourceDex,
      destinationDex: delta.destinationDex,
      usdcValue: delta.usdcValue,
      fee: delta.fee,
      nativeTokenFee: delta.nativeTokenFee,
      feeToken: delta.feeToken,
      nonce: delta.nonce,
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
            market: deriveMarket(p.coin),
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
    market: deriveMarket(entry.delta.coin),
    displaySymbol: entry.delta.coin,
    displayQuote: null,
  },
  amount: entry.delta.usdc,
  positionSize: entry.delta.szi,
  fundingRate: entry.delta.fundingRate,
})
