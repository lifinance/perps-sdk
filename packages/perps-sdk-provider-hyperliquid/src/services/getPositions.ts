import type { Address, PositionsResponse } from '@lifi/perps-types'
import {
  type HlClearinghouseState,
  mapPosition,
} from '@lifi/perps-types/providers/hyperliquid'
import {
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../assetLookups.js'
import { PROVIDER_KEY } from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'
import { getSupportedSubDexes } from '../subdexes.js'

export interface GetPositionsParams {
  address: Address
  /** Filter to a single Hyperliquid asset identifier (e.g. `'BTC'`, `'xyz:PURR'`). */
  symbol?: string
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

  if (params.symbol !== undefined) {
    positions = positions.filter((p) => p.asset.assetId === params.symbol)
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
