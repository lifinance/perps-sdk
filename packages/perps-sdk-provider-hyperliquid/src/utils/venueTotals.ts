import {
  addDecimalString,
  safeAddDecimalString,
  unknownToDecimalString,
} from '@lifi/perps-sdk'
import type {
  DecimalString,
  HyperliquidMarginSummary,
  Position,
} from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'

/**
 * One perps sub-dex entry {@link perpsTotals} reads. The REST response always
 * carries `marginSummary`; a WebSocket frame may omit it.
 * @public
 */
export interface DexMarginSummary {
  marginSummary?: HyperliquidMarginSummary
}

/**
 * Sum the venue `marginSummary` totals over every perps sub-dex of an
 * account. `accountValue` is total equity, so it already carries locked
 * margin and unrealized PnL. An entry without a `marginSummary` adds nothing.
 * @throws {PerpsError} `SDKError` when a venue figure is not a decimal.
 * @public
 */
export const perpsTotals = (
  dexStates: readonly DexMarginSummary[]
): { accountValue: DecimalString; marginUsed: DecimalString } => {
  let accountValue = '0'
  let marginUsed = '0'
  for (const { marginSummary } of dexStates) {
    if (marginSummary === undefined) {
      continue
    }
    accountValue = addDecimalString(
      accountValue,
      unknownToDecimalString(
        marginSummary.accountValue,
        'marginSummary.accountValue',
        PROVIDER_KEY
      )
    )
    marginUsed = addDecimalString(
      marginUsed,
      unknownToDecimalString(
        marginSummary.totalMarginUsed,
        'marginSummary.totalMarginUsed',
        PROVIDER_KEY
      )
    )
  }
  return { accountValue, marginUsed }
}

/**
 * Sum the unrealized PnL of every position, in quote-asset units.
 * @public
 */
export const sumUnrealizedPnl = (
  positions: readonly Position[]
): DecimalString =>
  positions.reduce(
    (sum, position) =>
      addDecimalString(
        sum,
        unknownToDecimalString(
          position.unrealizedPnl,
          'position.unrealizedPnl',
          PROVIDER_KEY
        )
      ),
    '0'
  )

/**
 * Sum every term, or `undefined` with a warning when any term is not a
 * decimal string. A bad term never gives a partial sum.
 */
export const safeSumDecimalStrings = (
  terms: readonly string[]
): DecimalString | undefined =>
  terms.reduce<DecimalString | undefined>(
    (sum, term) =>
      sum === undefined ? undefined : safeAddDecimalString(sum, term),
    '0'
  )
