import {
  type AssetRegistry,
  ExplorerChainId,
  explorerTxUrl,
  PerpsError,
} from '@lifi/perps-sdk'
import type {
  ActivityItem,
  Asset,
  DepositActivity,
  Fee,
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType, PerpsErrorCode } from '@lifi/perps-types'
import Big from 'big.js'
import type {
  HlFundingUpdate,
  HlLedgerUpdate,
  HlUserFill,
} from '../types/index.js'
import {
  isCollateralTransferDelta,
  isDepositDelta,
  isLiquidationDelta,
  isSendAssetDelta,
  isSpotTransferDelta,
  isVaultTransferDelta,
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

// Hyperliquid reserves spot token index 0 for USDC.
const HL_COLLATERAL_ASSET_ID = '0'

/**
 * A ledger row moves a spot asset — a perp contract cannot be sent, received
 * or withdrawn — so the delta's token symbol resolves inside the spot asset
 * registry. The HIP-1 ticker auction keeps those symbols unique.
 */
const resolveLedgerAsset = (symbol: string, registry: AssetRegistry): Asset => {
  const asset = registry.assets.find(
    (candidate) => candidate.displaySymbol === symbol
  )
  if (asset === undefined) {
    const error = new PerpsError(
      PerpsErrorCode.ValidationError,
      `[hyperliquid] stale or mis-keyed asset registry: unknown spot symbol '${symbol}'`
    )
    error.tool = 'hyperliquid'
    throw error
  }
  return asset
}

/**
 * Map supported ledger entries; exclude same-account moves and unsupported types.
 * Missing assets throw; unresolved liquidation markets omit only those positions.
 * @public
 */
export const mapLedgerEntry = (
  entry: HlLedgerUpdate,
  providerKey: string,
  queriedAddress: string,
  assetRegistry: AssetRegistry,
  resolveMarket: (coin: string) => MarketDisplay | undefined
): ActivityItem | null => {
  const { delta } = entry
  const base = {
    id: entry.hash,
    provider: providerKey,
    timestamp: new Date(entry.time).toISOString(),
  }

  if (
    isSpotTransferDelta(delta) ||
    isSendAssetDelta(delta) ||
    isCollateralTransferDelta(delta)
  ) {
    const queried = queriedAddress.toLowerCase()
    const sender = delta.user.toLowerCase()
    const recipient = delta.destination.toLowerCase()
    if (sender === recipient && sender === queried) {
      return null
    }
    const direction: 'IN' | 'OUT' = queried === sender ? 'OUT' : 'IN'
    const fees: Fee[] = []
    if (delta.fee !== undefined) {
      fees.push({
        amount: delta.fee,
        asset: isSendAssetDelta(delta)
          ? delta.feeToken.split(':')[0]
          : HL_COLLATERAL_SYMBOL,
      })
    }
    if (
      !isCollateralTransferDelta(delta) &&
      delta.nativeTokenFee !== undefined
    ) {
      fees.push({ amount: delta.nativeTokenFee, asset: HL_NATIVE_TOKEN_SYMBOL })
    }
    const meta: Record<string, unknown> = {
      transferType: isSendAssetDelta(delta) ? 'sendAsset' : delta.type,
    }
    if (!isCollateralTransferDelta(delta)) {
      if (delta.usdcValue !== undefined) {
        meta.usdcValue = delta.usdcValue
      }
      if (delta.nonce !== undefined) {
        meta.nonce = delta.nonce
      }
    }
    if (isSendAssetDelta(delta)) {
      meta.sourceDex = delta.sourceDex
      meta.destinationDex = delta.destinationDex
    }
    return {
      ...base,
      type: ActivityType.TRANSFER,
      direction,
      counterpartyAddress: direction === 'OUT' ? recipient : sender,
      asset: isCollateralTransferDelta(delta)
        ? assetRegistry.require(HL_COLLATERAL_ASSET_ID)
        : resolveLedgerAsset(delta.token, assetRegistry),
      amount: isCollateralTransferDelta(delta) ? delta.usdc : delta.amount,
      ...(fees.length === 0 ? {} : { fees }),
      meta,
      explorerLink: explorerTxUrl(ExplorerChainId.HYPERLIQUID, entry.hash),
    } satisfies TransferActivity
  }

  if (isVaultTransferDelta(delta)) {
    const queried = queriedAddress.toLowerCase()
    const vault = delta.vault.toLowerCase()
    if (delta.type === 'vaultDeposit' && queried === vault) {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        'Hyperliquid vaultDeposit identifies no depositor for the vault account'
      )
    }
    if (
      delta.type === 'vaultWithdraw' &&
      delta.user.toLowerCase() === vault &&
      queried === vault
    ) {
      return null
    }
    return {
      ...base,
      type: ActivityType.TRANSFER,
      direction:
        delta.type === 'vaultDeposit' || queried === vault ? 'OUT' : 'IN',
      counterpartyAddress:
        delta.type === 'vaultWithdraw' && queried === vault
          ? delta.user.toLowerCase()
          : vault,
      asset: assetRegistry.require(HL_COLLATERAL_ASSET_ID),
      amount:
        delta.type === 'vaultDeposit' ? delta.usdc : delta.netWithdrawnUsd,
      meta:
        delta.type === 'vaultDeposit'
          ? { transferType: delta.type }
          : {
              transferType: delta.type,
              requestedUsd: delta.requestedUsd,
              commission: delta.commission,
              closingCost: delta.closingCost,
              basis: delta.basis,
            },
      explorerLink: explorerTxUrl(ExplorerChainId.HYPERLIQUID, entry.hash),
    } satisfies TransferActivity
  }

  if (isDepositDelta(delta)) {
    // The `deposit` delta names no sending address, so the activity carries no
    // `counterpartyAddress`.
    return {
      ...base,
      type: ActivityType.DEPOSIT,
      asset: assetRegistry.require(HL_COLLATERAL_ASSET_ID),
      amount: delta.usdc,
      explorerLink: explorerTxUrl(ExplorerChainId.HYPERLIQUID, entry.hash),
    } satisfies DepositActivity
  }

  if (isWithdrawDelta(delta)) {
    return {
      ...base,
      type: ActivityType.WITHDRAWAL,
      asset: assetRegistry.require(HL_COLLATERAL_ASSET_ID),
      amount: delta.usdc,
      ...(delta.fee === undefined
        ? {}
        : { fee: { amount: delta.fee, asset: HL_COLLATERAL_SYMBOL } }),
      explorerLink: explorerTxUrl(ExplorerChainId.HYPERLIQUID, entry.hash),
    } satisfies WithdrawalActivity
  }

  if (isLiquidationDelta(delta)) {
    const resolvedPositions = (delta.liquidatedPositions ?? []).flatMap((p) => {
      const market = resolveMarket(p.coin)
      return market === undefined ? [] : [{ market, size: p.szi }]
    })
    // Liquidation rows must point to at least one market. Drop entries with
    // missing/empty positions so downstream consumers can rely on that
    // invariant and avoid rendering a market-less liquidation card.
    const [firstPosition, ...restPositions] = resolvedPositions
    if (firstPosition === undefined) {
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
      liquidatedPositions: [firstPosition, ...restPositions],
    } satisfies LiquidationActivity
  }

  return null
}

/**
 * Map a Hyperliquid funding ledger update to a normalized funding activity, or
 * `null` when `resolveMarket` cannot identify the row's coin. `amount`,
 * `positionSize`, and `fundingRate` retain the upstream decimal strings;
 * `resolveMarket` supplies the provider-agnostic market metadata.
 *
 * `userFunding` entries all carry the zero hash, so a deterministic
 * `funding:<coin>:<ISO time>` id is synthesized — funding accrues at most
 * once per coin per hourly settlement, so the pair is unique per account.
 * @public
 */
export const mapFundingActivity = (
  entry: HlFundingUpdate,
  providerKey: string,
  resolveMarket: (coin: string) => MarketDisplay | undefined
): FundingActivity | null => {
  const market = resolveMarket(entry.delta.coin)
  if (market === undefined) {
    return null
  }
  const timestamp = new Date(entry.time).toISOString()
  return {
    id: `funding:${entry.delta.coin}:${timestamp}`,
    provider: providerKey,
    timestamp,
    type: ActivityType.FUNDING,
    market,
    amount: entry.delta.usdc,
    positionSize: entry.delta.szi,
    fundingRate: entry.delta.fundingRate,
  }
}

/**
 * Build one liquidation activity per liquidation order from the fills of the
 * liquidated account. Hyperliquid attaches `liquidation` to the fills of both
 * parties, so only fills whose `liquidatedUser` is the queried address count.
 * A fill whose hash a ledger liquidation row already carries is the same
 * event and is skipped. The size sign follows the closed position: a sell
 * fill closes a long. Groups whose market does not resolve are dropped.
 * @public
 */
export const mapLiquidationFills = (
  fills: HlUserFill[],
  providerKey: string,
  queriedAddress: string,
  resolveMarket: (coin: string) => MarketDisplay | undefined,
  ledgerHashes: ReadonlySet<string>
): LiquidationActivity[] => {
  const queried = queriedAddress.toLowerCase()
  const byOrder = new Map<number, HlUserFill[]>()
  for (const fill of fills) {
    if (
      fill.liquidation?.liquidatedUser.toLowerCase() !== queried ||
      (fill.hash !== undefined && ledgerHashes.has(fill.hash))
    ) {
      continue
    }
    const group = byOrder.get(fill.oid) ?? []
    group.push(fill)
    byOrder.set(fill.oid, group)
  }
  return [...byOrder.entries()].flatMap(([oid, group]) => {
    const [first] = group
    const market = resolveMarket(first.coin)
    if (market === undefined) {
      return []
    }
    let size = new Big(0)
    let notional = new Big(0)
    let time = first.time
    for (const fill of group) {
      size = size.plus(fill.sz)
      notional = notional.plus(new Big(fill.px).times(fill.sz))
      time = Math.max(time, fill.time)
    }
    return [
      {
        id: `liquidation:${oid}`,
        provider: providerKey,
        timestamp: new Date(time).toISOString(),
        type: ActivityType.LIQUIDATION,
        liquidatedNotionalPosition: notional.toFixed(),
        liquidatedPositions: [
          {
            market,
            size: (first.side === 'A' ? size : size.neg()).toFixed(),
          },
        ],
      } satisfies LiquidationActivity,
    ]
  })
}
