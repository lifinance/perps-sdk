import {
  isDecimalString,
  safeAddDecimalString,
  safeIsDecimalStringZero,
  safeSubtractDecimalString,
} from '@lifi/perps-sdk'
import type { PortfolioHistoryPoint } from '@lifi/perps-types'
import { isAddress } from 'viem'
import {
  type HlLedgerDelta,
  type HlLedgerUpdate,
  isBorrowLendDelta,
  isCollateralTransferDelta,
  isCStakingTransferDelta,
  isDepositDelta,
  isSendAssetDelta,
  isSpotTransferDelta,
  isVaultTransferDelta,
  isWithdrawDelta,
} from '../types/index.js'

const NON_CAPITAL_DELTAS: Readonly<Record<string, true>> = {
  funding: true,
  liquidation: true,
  rewardsClaim: true,
  vaultLeaderCommission: true,
  deployGasAuction: true,
  spotGenesis: true,
}

const parseUnsignedAmount = (value: unknown): string | undefined =>
  isDecimalString(value) && !value.startsWith('-') ? value : undefined

const parseSignedAmount = (
  value: unknown,
  incoming: boolean
): string | undefined => {
  const amount = parseUnsignedAmount(value)
  return amount === undefined
    ? undefined
    : incoming
      ? amount
      : safeSubtractDecimalString('0', amount)
}

const parseTokenUsd = (delta: {
  token: string
  amount: string
  usdcValue?: string
}): string | undefined => {
  const amount = parseUnsignedAmount(delta.amount)
  if (amount === undefined) {
    return undefined
  }
  return delta.token.split(':')[0] === 'USDC'
    ? amount
    : parseUnsignedAmount(delta.usdcValue)
}

const classifyCapitalMovement = (
  delta: HlLedgerDelta,
  queried: string,
  combined: boolean
): string | undefined => {
  if (isDepositDelta(delta)) {
    return parseSignedAmount(delta.usdc, true)
  }
  if (isWithdrawDelta(delta)) {
    return parseSignedAmount(delta.usdc, false)
  }
  if (
    isCollateralTransferDelta(delta) ||
    isSpotTransferDelta(delta) ||
    isSendAssetDelta(delta)
  ) {
    if (
      !isAddress(delta.user, { strict: false }) ||
      !isAddress(delta.destination, { strict: false })
    ) {
      return undefined
    }
    const sender = delta.user.toLowerCase()
    const recipient = delta.destination.toLowerCase()
    let sourceIncluded = combined || !isSpotTransferDelta(delta)
    let destinationIncluded = sourceIncluded
    if (isSendAssetDelta(delta)) {
      sourceIncluded = combined || delta.sourceDex !== 'spot'
      destinationIncluded = combined || delta.destinationDex !== 'spot'
    }
    const outgoing = sender === queried && sourceIncluded
    const incoming = recipient === queried && destinationIncluded
    if (incoming === outgoing) {
      return '0'
    }
    return parseSignedAmount(
      isCollateralTransferDelta(delta) ? delta.usdc : parseTokenUsd(delta),
      incoming
    )
  }
  if (isVaultTransferDelta(delta)) {
    if (!isAddress(delta.vault, { strict: false })) {
      return undefined
    }
    const vault = delta.vault.toLowerCase()
    if (delta.type === 'vaultDeposit') {
      return vault === queried
        ? undefined
        : parseSignedAmount(delta.usdc, false)
    }
    if (!isAddress(delta.user, { strict: false })) {
      return undefined
    }
    const user = delta.user.toLowerCase()
    if (vault === queried && user === queried) {
      return '0'
    }
    if (vault === queried) {
      return parseSignedAmount(delta.requestedUsd, false)
    }
    return user === queried
      ? parseSignedAmount(delta.netWithdrawnUsd, true)
      : undefined
  }
  if (delta.type === 'cStakingTransfer' || delta.type === 'borrowLend') {
    if (!combined) {
      return '0'
    }
    if (isCStakingTransferDelta(delta)) {
      return parseSignedAmount(parseTokenUsd(delta), !delta.isDeposit)
    }
    if (!isBorrowLendDelta(delta)) {
      return undefined
    }
    const interest = parseUnsignedAmount(delta.interestAmount)
    if (interest === undefined) {
      return undefined
    }
    const releases =
      delta.operation === 'withdraw' || delta.operation === 'borrow'
    let amount = parseTokenUsd(delta)
    if (
      amount !== undefined &&
      (delta.operation === 'withdraw' || delta.operation === 'repay') &&
      !safeIsDecimalStringZero(interest)
    ) {
      amount = safeSubtractDecimalString(amount, interest)
    }
    return parseSignedAmount(amount, releases)
  }
  if (delta.type === 'accountClassTransfer') {
    if (combined) {
      return '0'
    }
    return typeof delta.toPerp === 'boolean'
      ? parseSignedAmount(delta.usdc, delta.toPerp)
      : undefined
  }
  if (delta.type === 'vaultCreate') {
    return typeof delta.vault === 'string' &&
      isAddress(delta.vault, { strict: false }) &&
      delta.vault.toLowerCase() !== queried
      ? parseSignedAmount(delta.usdc, false)
      : undefined
  }
  return Object.hasOwn(NON_CAPITAL_DELTAS, delta.type) ? '0' : undefined
}

/** Add cumulative USD flows for the selected spot-and-perps or perps-only balances. */
export const mapPortfolioTransfers = (
  points: PortfolioHistoryPoint[],
  ledger: HlLedgerUpdate[],
  address: string,
  combined: boolean
): PortfolioHistoryPoint[] => {
  const first = points[0]
  if (first === undefined) {
    return []
  }
  const ordered = ledger
    .filter((entry) => entry.time > first.timestamp)
    .sort((a, b) => a.time - b.time)
  const queried = address.toLowerCase()
  let index = 0
  let cumulative: string | undefined = '0'
  return points.map((point) => {
    while (index < ordered.length && ordered[index].time <= point.timestamp) {
      const entry = ordered[index++]
      if (cumulative !== undefined) {
        const movement = classifyCapitalMovement(entry.delta, queried, combined)
        cumulative =
          movement === undefined
            ? undefined
            : safeAddDecimalString(cumulative, movement)
      }
    }
    return {
      ...point,
      ...(cumulative === undefined ? {} : { netTransfers: cumulative }),
    }
  })
}
