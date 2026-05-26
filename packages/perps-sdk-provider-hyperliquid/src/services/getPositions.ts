import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HlClearinghouseState } from '../types/index.js'
import { enrichAsset, type HlAssetContext } from '../utils/assetContext.js'
import { mapPosition } from '../utils/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'

export interface GetPositionsParams {
  address: Address
  /** Filter to a single canonical `Asset.assetId` (e.g. `'BTC'`, `'xyz:PURR'`). */
  assetId?: string
  /** Page size hint surfaced on the response. Hyperliquid returns all open positions in one call, so pagination is never required. */
  limit?: number
}

/**
 * Fetch open positions across every supported perps sub-dex for `address`,
 * normalised into `PositionsResponse`. Zero-size entries are dropped. Market
 * metadata (`ctx`) is sourced backend-side; only `clearinghouseState` is read
 * direct from Hyperliquid.
 */
export const getPositions = async (
  apiUrl: string,
  params: GetPositionsParams,
  ctx: HlAssetContext,
  options?: InfoRequestOptions
): Promise<PositionsResponse> => {
  const stateResults = await Promise.all(
    ctx.dexNames.map((name) =>
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
  )

  let positions = stateResults
    .flatMap((state) =>
      state.assetPositions
        .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
        .map((ap) => mapPosition(ap))
    )
    .map((pos) => ({ ...pos, asset: enrichAsset(pos.asset.assetId, ctx) }))

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
