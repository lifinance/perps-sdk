import {
  createWarnOnce,
  isDecimalString,
  isDecimalStringGreaterThan,
} from '@lifi/perps-sdk'
import type { DecimalString, Fill } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoLeverage } from '../types/wire.js'
import type { OndoApiClient } from './apiClient.js'

const warnLeverageReadOnce = createWarnOnce()

/**
 * Current leverage setting of each market that a fill with a `closedSize`
 * trades, keyed by `Market.id`. One `/v1/perps/leverage` read covers every
 * market. A failed read gives an empty map, and a market without a positive
 * leverage row stays out, so the ROE of its fills stays absent.
 *
 * @throws The abort reason when `signal` aborts.
 */
export const fetchFillLeverages = async (
  client: OndoApiClient,
  authToken: string,
  fills: readonly Fill[],
  signal?: AbortSignal
): Promise<Map<string, DecimalString>> => {
  const marketIds = new Set(
    fills.flatMap((fill) =>
      fill.closedSize === undefined ? [] : [fill.market.id]
    )
  )
  if (marketIds.size === 0) {
    return new Map()
  }
  let rows: OndoLeverage[]
  try {
    rows = await client.get<OndoLeverage[]>('/v1/perps/leverage', {
      authToken,
    })
  } catch (error) {
    signal?.throwIfAborted()
    warnLeverageReadOnce(
      'leverage',
      `[${ONDO_PROVIDER_KEY}] leverage read failed; fills carry no returnOnEquity: ${String(error)}`
    )
    return new Map()
  }
  const leverages = new Map<string, DecimalString>()
  for (const row of rows) {
    if (
      marketIds.has(row.market) &&
      isDecimalString(row.leverage) &&
      isDecimalStringGreaterThan(row.leverage, '0')
    ) {
      leverages.set(row.market, row.leverage)
    }
  }
  for (const marketId of marketIds) {
    if (!leverages.has(marketId)) {
      warnLeverageReadOnce(
        marketId,
        `[${ONDO_PROVIDER_KEY}] no positive leverage for market '${marketId}'; its fills carry no returnOnEquity`
      )
    }
  }
  return leverages
}
