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
  const liquidatedPositions = (event.triggeringPositions ?? []).flatMap((p) => {
    const market = resolveMarket(p.market)
    return market === undefined ? [] : [{ market, size: p.netQuantity }]
  })
  if (liquidatedPositions.length === 0) {
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
    liquidatedPositions,
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
 * Map an Ondo wallet deposit to a {@link DepositActivity}. Ondo carries no
 * deposit id on the wire and addresses a single deposit by transaction id, so
 * the id is `deposit:<txid>`, suffixed with `logIndex` when one transaction
 * carried several deposits. `coin` is already a display symbol, so it is the
 * normalized asset identity.
 *
 * @public
 */
export const mapDepositActivity = (
  deposit: OndoWalletDeposit
): DepositActivity => ({
  id: depositId(deposit),
  provider: ONDO_PROVIDER_KEY,
  timestamp: new Date(deposit.time).toISOString(),
  type: ActivityType.DEPOSIT,
  asset: deposit.coin,
  amount: deposit.size,
  ...(deposit.txid === ''
    ? {}
    : { explorerLink: `https://scan.li.fi/tx/${deposit.txid}` }),
})

const SETTLING_WITHDRAWAL_STATUSES = new Set<string>([
  'complete',
  'pending',
  'unknown',
])

/**
 * Map an Ondo wallet withdrawal to a {@link WithdrawalActivity}, or `null`
 * when the venue reports a status under which no value left the account.
 * Ondo reports `usdFee` in USD rather than in the withdrawn asset, so `fee`
 * stays absent instead of claiming a fee the public field cannot express.
 *
 * @public
 */
export const mapWithdrawalActivity = (
  withdrawal: OndoWalletWithdrawal
): WithdrawalActivity | null => {
  if (!SETTLING_WITHDRAWAL_STATUSES.has(withdrawal.status)) {
    return null
  }
  return {
    id: withdrawal.withdrawal_id,
    provider: ONDO_PROVIDER_KEY,
    timestamp: new Date(withdrawal.time).toISOString(),
    type: ActivityType.WITHDRAWAL,
    asset: withdrawal.coin,
    amount: withdrawal.size,
    ...(withdrawal.txid === ''
      ? {}
      : { explorerLink: `https://scan.li.fi/tx/${withdrawal.txid}` }),
  }
}
