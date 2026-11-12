import {
  createWarnOnce,
  numberToDecimalString,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { DecimalString, Fill } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import { fetchActiveAssetData } from './activeAssetData.js'

const warnLeverageReadOnce = createWarnOnce()

/**
 * Current leverage setting of each market that a fill with a `closedSize`
 * trades, keyed by `Market.id`. Reads `activeAssetData` once for each such
 * market. A failed read leaves its market out, so the ROE of its fills stays
 * absent.
 *
 * @throws The abort reason when `options.signal` aborts.
 */
export const fetchFillLeverages = async (
  context: HyperliquidContext,
  address: Address,
  fills: readonly Fill[],
  options?: SDKRequestOptions
): Promise<Map<string, DecimalString>> => {
  const marketIds = [
    ...new Set(
      fills.flatMap((fill) =>
        fill.closedSize === undefined ? [] : [fill.market.id]
      )
    ),
  ]
  const reads = await Promise.allSettled(
    marketIds.map(async (marketId) => {
      const data = await fetchActiveAssetData(
        context,
        address,
        marketId,
        options
      )
      return numberToDecimalString(data.leverage.value)
    })
  )
  options?.signal?.throwIfAborted()
  const leverages = new Map<string, DecimalString>()
  reads.forEach((read, index) => {
    const marketId = marketIds[index]
    if (read.status === 'fulfilled') {
      leverages.set(marketId, read.value)
      return
    }
    warnLeverageReadOnce(
      marketId,
      `[${PROVIDER_KEY}] leverage read failed for market '${marketId}'; its fills carry no returnOnEquity: ${String(read.reason)}`
    )
  })
  return leverages
}
