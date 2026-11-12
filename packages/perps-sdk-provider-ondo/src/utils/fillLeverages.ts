import { createWarnOnce } from '@lifi/perps-sdk'
import type { DecimalString, Fill } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoLeverage } from '../types/wire.js'
import type { OndoApiClient } from './apiClient.js'

const warnLeverageReadOnce = createWarnOnce()

/**
 * Current leverage setting of every market, keyed by `Market.id`, when a fill
 * has a `closedSize`. One `/v1/perps/leverage` read covers every market. A
 * failed read gives an empty map, so the ROE of the fills stays absent.
 *
 * @throws The abort reason when `signal` aborts.
 */
export const fetchFillLeverages = async (
  client: OndoApiClient,
  authToken: string,
  fills: readonly Fill[],
  signal?: AbortSignal
): Promise<Map<string, DecimalString>> => {
  if (!fills.some((fill) => fill.closedSize !== undefined)) {
    return new Map()
  }
  try {
    const rows = await client.get<OndoLeverage[]>('/v1/perps/leverage', {
      authToken,
    })
    return new Map(rows.map((row) => [row.market, row.leverage]))
  } catch (error) {
    signal?.throwIfAborted()
    warnLeverageReadOnce(
      'leverage',
      `[${ONDO_PROVIDER_KEY}] leverage read failed; fills carry no returnOnEquity: ${String(error)}`
    )
    return new Map()
  }
}
