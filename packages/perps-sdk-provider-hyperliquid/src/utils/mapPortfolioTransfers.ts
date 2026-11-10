import {
  isDecimalString,
  safeAddDecimalString,
  safeIsDecimalStringZero,
  safeSubtractDecimalString,
} from '@lifi/perps-sdk'
import type { PortfolioHistoryPoint } from '@lifi/perps-types'
import { isAddress } from 'viem'
import type { HlLedgerDelta, HlLedgerUpdate } from '../types/index.js'

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

const classifyCapitalMovement = (
  delta: HlLedgerDelta,
  queried: string,
  combined: boolean
): string | undefined => {
  const fields: Readonly<Record<string, unknown>> = delta
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
  const parseTokenUsd = (): string | undefined => {
    const amount = parseUnsignedAmount(fields.amount)
    if (amount === undefined || typeof fields.token !== 'string') {
      return undefined
    }
    return fields.token.split(':')[0] === 'USDC'
      ? amount
      : parseUnsignedAmount(fields.usdcValue)
  }

  switch (delta.type) {
    case 'deposit':
      return parseSignedAmount(fields.usdc, true)
    case 'withdraw':
      return parseSignedAmount(fields.usdc, false)
    case 'accountClassTransfer':
      return combined
        ? '0'
        : typeof fields.toPerp === 'boolean'
          ? parseSignedAmount(fields.usdc, fields.toPerp)
          : undefined
    case 'internalTransfer':
    case 'subAccountTransfer':
    case 'spotTransfer':
    case 'send': {
      if (
        typeof fields.user !== 'string' ||
        !isAddress(fields.user, { strict: false }) ||
        typeof fields.destination !== 'string' ||
        !isAddress(fields.destination, { strict: false })
      ) {
        return undefined
      }
      const sender = fields.user.toLowerCase()
      const recipient = fields.destination.toLowerCase()
      let sourceIncluded = delta.type !== 'spotTransfer' || combined
      let destinationIncluded = sourceIncluded
      if (delta.type === 'send') {
        if (
          typeof fields.sourceDex !== 'string' ||
          typeof fields.destinationDex !== 'string'
        ) {
          return undefined
        }
        sourceIncluded = combined || fields.sourceDex !== 'spot'
        destinationIncluded = combined || fields.destinationDex !== 'spot'
      }
      const outgoing = sender === queried && sourceIncluded
      const incoming = recipient === queried && destinationIncluded
      if (incoming === outgoing) {
        return '0'
      }
      return parseSignedAmount(
        delta.type === 'internalTransfer' || delta.type === 'subAccountTransfer'
          ? fields.usdc
          : parseTokenUsd(),
        incoming
      )
    }
    case 'vaultCreate':
    case 'vaultDeposit':
      if (
        typeof fields.vault !== 'string' ||
        fields.vault.toLowerCase() === queried
      ) {
        return undefined
      }
      return parseSignedAmount(fields.usdc, false)
    case 'vaultWithdraw': {
      if (typeof fields.vault !== 'string' || typeof fields.user !== 'string') {
        return undefined
      }
      const vault = fields.vault.toLowerCase()
      const user = fields.user.toLowerCase()
      if (vault === queried && user === queried) {
        return '0'
      }
      if (vault === queried) {
        return parseSignedAmount(fields.requestedUsd, false)
      }
      return user === queried
        ? parseSignedAmount(fields.netWithdrawnUsd, true)
        : undefined
    }
    case 'cStakingTransfer':
      if (!combined) {
        return '0'
      }
      return typeof fields.isDeposit === 'boolean'
        ? parseSignedAmount(parseTokenUsd(), !fields.isDeposit)
        : undefined
    case 'borrowLend': {
      if (!combined) {
        return '0'
      }
      const operation = fields.operation
      if (
        operation !== 'supply' &&
        operation !== 'withdraw' &&
        operation !== 'borrow' &&
        operation !== 'repay'
      ) {
        return undefined
      }
      let amount = parseTokenUsd()
      const interest = parseUnsignedAmount(fields.interestAmount)
      if (interest === undefined) {
        return undefined
      }
      if (
        (operation === 'withdraw' || operation === 'repay') &&
        !safeIsDecimalStringZero(interest)
      ) {
        // A token-unit interest amount cannot be subtracted from a USD valuation.
        if (
          typeof fields.token !== 'string' ||
          fields.token.split(':')[0] !== 'USDC'
        ) {
          return undefined
        }
        amount =
          amount === undefined
            ? undefined
            : safeSubtractDecimalString(amount, interest)
      }
      return parseSignedAmount(
        amount,
        operation === 'withdraw' || operation === 'borrow'
      )
    }
    default:
      return Object.hasOwn(NON_CAPITAL_DELTAS, delta.type) ? '0' : undefined
  }
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
  const seen = new Set<string>()
  const queried = address.toLowerCase()
  let index = 0
  let cumulative: string | undefined = '0'
  return points.map((point) => {
    while (index < ordered.length && ordered[index].time <= point.timestamp) {
      const entry = ordered[index++]
      const key = `${entry.time}:${entry.hash}:${JSON.stringify(entry.delta)}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
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
