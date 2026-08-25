import type {
  ActivityItem,
  DepositActivity,
  Fee,
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import type { HlFundingUpdate, HlLedgerUpdate } from '../types/index.js'
import {
  isDepositDelta,
  isLiquidationDelta,
  isSendAssetDelta,
  isSpotTransferDelta,
  isWithdrawDelta,
} from '../types/index.js'

/**
 * Hyperliquid settles every perp deposit and withdrawal in USDC, and charges
 * the `spotTransfer` fee in USDC too — that delta carries no `feeToken`.
 */
const HL_COLLATERAL_SYMBOL = 'USDC'

/**
 * Hyperliquid's native token. A `nativeTokenFee` names no token on the wire,
 * so the symbol comes from the venue rather than from the delta.
 */
const HL_NATIVE_TOKEN_SYMBOL = 'HYPE'

/**
 * Display symbol for a ledger delta's wire token (`"USDC"`, `"PURR:0x..."`).
 * The colon separates the name from the token id, so the symbol is the part
 * BEFORE it — the opposite half to a market coin's `dex:COIN`, which is why
 * `coinAsset` cannot be reused here.
 */
const ledgerTokenSymbol = (token: string): string => {
  const separator = token.indexOf(':')
  return separator === -1 ? token : token.slice(0, separator)
}

/**
 * Map a Hyperliquid non-funding ledger entry to an ActivityItem.
 *
 * Direction for `spotTransfer` and `sendAsset` is derived from
 * `queriedAddress` matching the delta's `user` (OUT) or `destination` (IN).
 * Returns null for unsupported delta types and for same-account moves, where
 * `user === destination === queriedAddress`.
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

    // A transfer reports a movement between two accounts. A row whose sender
    // and recipient are the queried account moves nothing between accounts.
    if (sender === recipient && sender === queried) {
      return null
    }

    const direction: 'IN' | 'OUT' = queried === sender ? 'OUT' : 'IN'
    const counterpartyAddress = direction === 'OUT' ? recipient : sender
    const meta: Record<string, unknown> = {
      transferType: 'spotTransfer',
    }
    if (delta.usdcValue !== undefined) {
      meta.usdcValue = delta.usdcValue
    }
    if (delta.nonce !== undefined) {
      meta.nonce = delta.nonce
    }
    const fees: Fee[] = []
    if (delta.fee !== undefined) {
      fees.push({ amount: delta.fee, asset: HL_COLLATERAL_SYMBOL })
    }
    if (delta.nativeTokenFee !== undefined) {
      fees.push({
        amount: delta.nativeTokenFee,
        asset: HL_NATIVE_TOKEN_SYMBOL,
      })
    }
    return {
      ...base,
      type: ActivityType.TRANSFER,
      direction,
      counterpartyAddress,
      asset: ledgerTokenSymbol(delta.token),
      amount: delta.amount,
      ...(fees.length === 0 ? {} : { fees }),
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
      nonce: delta.nonce,
    }
    return {
      ...base,
      type: ActivityType.TRANSFER,
      direction,
      counterpartyAddress,
      asset: ledgerTokenSymbol(delta.token),
      amount: delta.amount,
      fees: [
        { amount: delta.fee, asset: ledgerTokenSymbol(delta.feeToken) },
        { amount: delta.nativeTokenFee, asset: HL_NATIVE_TOKEN_SYMBOL },
      ],
      meta,
      explorerLink: entry.hash
        ? `https://app.hyperliquid.xyz/explorer/tx/${entry.hash}`
        : undefined,
    } satisfies TransferActivity
  }

  if (isDepositDelta(delta)) {
    return {
      ...base,
      type: ActivityType.DEPOSIT,
      asset: HL_COLLATERAL_SYMBOL,
      amount: delta.usdc,
      explorerLink: entry.hash
        ? `https://scan.li.fi/tx/${entry.hash}`
        : undefined,
    } satisfies DepositActivity
  }

  if (isWithdrawDelta(delta)) {
    return {
      ...base,
      type: ActivityType.WITHDRAWAL,
      asset: HL_COLLATERAL_SYMBOL,
      amount: delta.usdc,
      ...(delta.fee === undefined
        ? {}
        : { fee: { amount: delta.fee, asset: HL_COLLATERAL_SYMBOL } }),
      explorerLink: entry.hash
        ? `https://scan.li.fi/tx/${entry.hash}`
        : undefined,
    } satisfies WithdrawalActivity
  }

  if (isLiquidationDelta(delta)) {
    const liquidatedPositions = (delta.liquidatedPositions ?? []).map((p) => ({
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
      ...(delta.liquidatedNtlPos === undefined
        ? {}
        : { liquidatedNotionalPosition: delta.liquidatedNtlPos }),
      ...(delta.accountValue === undefined
        ? {}
        : { accountValue: delta.accountValue }),
      leverageType: delta.leverageType,
      liquidatedPositions,
    } satisfies LiquidationActivity
  }

  return null
}

/**
 * Map a Hyperliquid funding ledger update to a normalized funding activity.
 * `amount`, `positionSize`, and `fundingRate` retain the upstream decimal
 * strings; `resolveMarket` supplies the provider-agnostic market metadata.
 *
 * `userFunding` entries all carry the zero hash, so a deterministic
 * `funding:<coin>:<ISO time>` id is synthesized — funding accrues at most
 * once per coin per hourly settlement, so the pair is unique per account.
 * @public
 */
export const mapFundingActivity = (
  entry: HlFundingUpdate,
  providerKey: string,
  resolveMarket: (coin: string) => MarketDisplay
): FundingActivity => {
  const timestamp = new Date(entry.time).toISOString()
  return {
    id: `funding:${entry.delta.coin}:${timestamp}`,
    provider: providerKey,
    timestamp,
    type: ActivityType.FUNDING,
    market: resolveMarket(entry.delta.coin),
    amount: entry.delta.usdc,
    positionSize: entry.delta.szi,
    fundingRate: entry.delta.fundingRate,
  }
}
