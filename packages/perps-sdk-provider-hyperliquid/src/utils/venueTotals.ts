import {
  addDecimalString,
  addDecimalStrings,
  createWarnOnce,
  isDecimalString,
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

const warnSkippedTermOnce = createWarnOnce()

/**
 * Sum the unrealized PnL of every position, in quote-asset units. A term that
 * does not match the decimal pattern adds nothing and warns once.
 * @public
 */
export const sumUnrealizedPnl = (
  positions: readonly Position[]
): DecimalString => {
  const terms: DecimalString[] = []
  for (const { unrealizedPnl } of positions) {
    if (isDecimalString(unrealizedPnl)) {
      terms.push(unrealizedPnl)
      continue
    }
    warnSkippedTermOnce(
      `${PROVIDER_KEY}|position.unrealizedPnl`,
      `[${PROVIDER_KEY}] skipping a \`position.unrealizedPnl\` term that does not match the decimal pattern: '${String(unrealizedPnl).slice(0, 64)}'`
    )
  }
  return addDecimalStrings(terms)
}
