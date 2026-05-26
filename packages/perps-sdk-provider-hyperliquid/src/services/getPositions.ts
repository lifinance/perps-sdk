import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HlClearinghouseState } from '../types/index.js'
import {
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../utils/assetLookups.js'
import { mapPosition } from '../utils/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { getSupportedSubDexes } from '../utils/subdexes.js'

export interface GetPositionsParams {
  address: Address
  /** Filter to a single canonical `Asset.assetId` (e.g. `'BTC'`, `'xyz:PURR'`). */
  assetId?: string
  /** Page size hint surfaced on the response. Hyperliquid returns all open positions in one call, so pagination is never required. */
  limit?: number
}

/**
 * Fetch open positions across every supported perps sub-dex for `address`,
 * normalised into `PositionsResponse`. Zero-size entries are dropped.
 */
export const getPositions = async (
  apiUrl: string,
  params: GetPositionsParams,
  options?: InfoRequestOptions
): Promise<PositionsResponse> => {
  const dexNames = await getSupportedSubDexes(apiUrl, options)

  const [stateResults, enrichmentMaps] = await Promise.all([
    Promise.all(
      dexNames.map((name) =>
        infoRequest<HlClearinghouseState>(
          apiUrl,
          {
            type: 'clearinghouseState',
            user: params.address,
            ...(name ? { dex: name } : {}),
          },
          options
        )
      )
    ),
    buildAssetEnrichmentMaps(apiUrl, options),
  ])

  const rawPositions = stateResults.flatMap((state) =>
    state.assetPositions
      .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
      .map((ap) => mapPosition(ap))
  )

  let positions = rawPositions.map((pos) => {
    const market = enrichmentMaps.assetMarketMap.get(pos.asset.assetId) ?? ''
    return {
      ...pos,
      asset: {
        ...pos.asset,
        market,
        displaySymbol: resolveDisplaySymbol(pos.asset.assetId, enrichmentMaps),
        displayQuote: resolveDisplayQuote(pos.asset.assetId, enrichmentMaps),
      },
    }
  })

  if (params.assetId !== undefined) {
    positions = positions.filter((p) => p.asset.assetId === params.assetId)
  }

  return {
    provider: PROVIDER_KEY,
    positions,
    pagination: {
      limit: params.limit ?? positions.length,
      hasMore: false,
    },
  }
}
