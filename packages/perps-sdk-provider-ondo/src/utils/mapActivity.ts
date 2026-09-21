import {
  type AssetRegistry,
  ExplorerChainId,
  explorerTxUrl,
} from '@lifi/perps-sdk'
import type {
  DepositActivity,
  FundingActivity,
  LiquidationActivity,
  MarketDisplay,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type {
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
  OndoWalletDeposit,
  OndoWalletWithdrawal,
} from '../types/wire.js'

/**
 * Map an Ondo funding-fee transfer to a {@link FundingActivity}. Ondo carries
 * no transfer id on the wire, so a deterministic `funding:<market>:<ISO time>`
 * id is synthesized — funding settles at most once per market per interval,
 * so the pair is unique.
 *
 * @param market - Backend-resolved market identity for `transfer.market`.
 * @public
 */
export const mapFundingActivity = (
  transfer: OndoFundingFeeTransfer,
  market: MarketDisplay
): FundingActivity => {
  const timestamp = new Date(transfer.time).toISOString()
  return {
    id: `funding:${transfer.market}:${timestamp}`,
    provider: ONDO_PROVIDER_KEY,
    timestamp,
    type: ActivityType.FUNDING,
    market,
    amount: transfer.amount,
    positionSize: transfer.positionSize,
    fundingRate: transfer.rate,
  }
}

/**
 * Map an Ondo liquidation event to a {@link LiquidationActivity}, or `null`
 * when the event names no triggering position. Ondo margin accounts are
 * cross-only, so `leverageType` is always `'cross'`. Ondo reports no account
 * value at liquidation time, so `accountValue` stays absent. One Ondo event
 * carries the whole cross-margin cascade in `triggeringPositions`, so every
 * resolvable liquidated market and size reaches `liquidatedPositions`.
 *
 * @param resolveMarket - Market identity for an Ondo market id, or `undefined`
 * when the backend market list does not hold it. A triggering position the
 * resolver cannot identify is dropped.
 * @public
 */
export const mapLiquidationActivity = (
  event: OndoLiquidationEvent,
  resolveMarket: (market: string) => MarketDisplay | undefined
): LiquidationActivity | null => {
  const resolvedPositions = (event.triggeringPositions ?? []).flatMap((p) => {
    const market = resolveMarket(p.market)
    return market === undefined ? [] : [{ market, size: p.netQuantity }]
  })
  const [firstPosition, ...restPositions] = resolvedPositions
  if (firstPosition === undefined) {
    return null
  }
  return {
    id: event.id,
    provider: ONDO_PROVIDER_KEY,
    timestamp: new Date(event.time).toISOString(),
    type: ActivityType.LIQUIDATION,
    ...(event.filledQuoteSize === undefined
      ? {}
      : { liquidatedNotionalPosition: event.filledQuoteSize }),
    leverageType: 'cross',
    liquidatedPositions: [firstPosition, ...restPositions],
  }
}

// Ondo reports no transaction id on a deposit it has not yet matched to a
// chain transaction, so two such deposits would share the bare `deposit:`
// key. Fall back to the fields the venue does report.
const depositId = (deposit: OndoWalletDeposit): string => {
  if (deposit.txid === '') {
    return `deposit:${deposit.time}:${deposit.coin}:${deposit.size}`
  }
  return deposit.logIndex === undefined
    ? `deposit:${deposit.txid}`
    : `deposit:${deposit.txid}:${deposit.logIndex}`
}

/**
 * Explorer chain per Ondo wire `chainId`, whose values Ondo's REST spec
 * enumerates. Ondo also settles on Bitcoin, Solana and testnets, and a row on
 * one of those resolves to no explorer link.
 */
const EXPLORER_CHAIN_BY_ONDO_CHAIN_ID: Record<string, ExplorerChainId> = {
  'eth-mainnet': ExplorerChainId.ETHEREUM,
}

const ondoExplorerLink = (
  chainId: string,
  txid: string
): string | undefined => {
  const explorerChainId = EXPLORER_CHAIN_BY_ONDO_CHAIN_ID[chainId]
  return explorerChainId === undefined
    ? undefined
    : explorerTxUrl(explorerChainId, txid)
}

/** Map a wallet deposit with registry asset identity and its on-chain transaction. @public */
export const mapDepositActivity = (
  deposit: OndoWalletDeposit,
  assetRegistry: AssetRegistry
): DepositActivity => {
  const explorerLink = ondoExplorerLink(deposit.chainId, deposit.txid)
  return {
    id: depositId(deposit),
    provider: ONDO_PROVIDER_KEY,
    timestamp: new Date(deposit.time).toISOString(),
    type: ActivityType.DEPOSIT,
    asset: assetRegistry.require(deposit.coin),
    amount: deposit.size,
    ...(deposit.fromAddress === ''
      ? {}
      : { counterpartyAddress: deposit.fromAddress }),
    ...(explorerLink === undefined ? {} : { explorerLink }),
  }
}

const SETTLING_WITHDRAWAL_STATUSES = new Set<string>([
  'complete',
  'pending',
  'unknown',
])

/** Ondo denominates a withdrawal fee in USD, whatever asset it withdraws. */
const ONDO_WITHDRAWAL_FEE_SYMBOL = 'USD'

/**
 * Map an Ondo wallet withdrawal to a {@link WithdrawalActivity}, or `null`
 * when the venue reports a status under which no value left the account. Ondo
 * charges the fee in USD, so `fee.asset` is `USD` and not the withdrawn asset.
 *
 * @public
 */
export const mapWithdrawalActivity = (
  withdrawal: OndoWalletWithdrawal,
  assetRegistry: AssetRegistry
): WithdrawalActivity | null => {
  if (!SETTLING_WITHDRAWAL_STATUSES.has(withdrawal.status)) {
    return null
  }
  const explorerLink = ondoExplorerLink(withdrawal.chainId, withdrawal.txid)
  return {
    id: withdrawal.withdrawal_id,
    provider: ONDO_PROVIDER_KEY,
    timestamp: new Date(withdrawal.time).toISOString(),
    type: ActivityType.WITHDRAWAL,
    asset: assetRegistry.require(withdrawal.coin),
    amount: withdrawal.size,
    // Loose equality also drops a `null` the live API may send for "no fee".
    ...(withdrawal.usdFee == null
      ? {}
      : {
          fee: {
            amount: withdrawal.usdFee,
            asset: ONDO_WITHDRAWAL_FEE_SYMBOL,
          },
        }),
    ...(explorerLink === undefined ? {} : { explorerLink }),
  }
}
