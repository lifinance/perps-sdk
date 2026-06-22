import type {
  ActivityItem,
  DepositActivity,
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import type { HlFundingUpdate, HlLedgerUpdate } from '../types/index.js'
import { isSendAssetDelta, isSpotTransferDelta } from '../types/index.js'

/**
 * Map a Hyperliquid non-funding ledger entry to an ActivityItem.
 *
 * Direction for `spotTransfer` and `sendAsset` is derived from
 * `queriedAddress` matching the delta's `user` (OUT) or `destination` (IN).
 * Returns null for unsupported delta types and for same-user `sendAsset`
 * dex moves (where `user === destination === queriedAddress`).
 * @public
 */
export const mapLedgerEntry = (
  entry: HlLedgerUpdate,
  providerKey: string,
  queriedAddress: string,
  resolveMarket: (coin: string) => MarketDisplay
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
      explorerLink: entry.hash
        ? `https://app.hyperliquid.xyz/explorer/tx/${entry.hash}`
        : undefined,
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
      explorerLink: entry.hash
        ? `https://app.hyperliquid.xyz/explorer/tx/${entry.hash}`
        : undefined,
    } satisfies TransferActivity
  }

  switch (delta.type) {
    case 'deposit':
      return {
        ...base,
        type: ActivityType.DEPOSIT,
        amount: delta.usdc ?? '0',
        explorerLink: entry.hash
          ? `https://scan.li.fi/tx/${entry.hash}`
          : undefined,
      } satisfies DepositActivity

    case 'withdraw':
      return {
        ...base,
        type: ActivityType.WITHDRAWAL,
        amount: delta.usdc ?? '0',
        fee: (delta as { fee?: string }).fee ?? '0',
        explorerLink: entry.hash
          ? `https://scan.li.fi/tx/${entry.hash}`
          : undefined,
      } satisfies WithdrawalActivity

    case 'liquidation': {
      const d = delta as unknown as {
        type: string
        liquidatedNtlPos: string
        accountValue: string
        leverageType: string
        liquidatedPositions?: { coin: string; szi: string }[]
      }
      const liquidatedPositions = (d.liquidatedPositions ?? []).map((p) => ({
        market: resolveMarket(p.coin),
        size: p.szi,
      }))
      // Liquidation rows must point to at least one market. Drop entries with
      // missing/empty positions so downstream consumers can rely on that
      // invariant and avoid rendering a market-less liquidation card.
      if (liquidatedPositions.length === 0) {
        return null
      }
      return {
        ...base,
        type: ActivityType.LIQUIDATION,
        liquidatedNotionalPosition: d.liquidatedNtlPos,
        accountValue: d.accountValue,
        leverageType: d.leverageType,
        liquidatedPositions,
      } satisfies LiquidationActivity
    }

    default:
      return null
  }
}

/** @public */
export const mapFundingActivity = (
  entry: HlFundingUpdate,
  providerKey: string,
  resolveMarket: (coin: string) => MarketDisplay
): FundingActivity => ({
  id: entry.hash,
  provider: providerKey,
  timestamp: new Date(entry.time).toISOString(),
  type: ActivityType.FUNDING,
  market: resolveMarket(entry.delta.coin),
  amount: entry.delta.usdc,
  positionSize: entry.delta.szi,
  fundingRate: entry.delta.fundingRate,
})
