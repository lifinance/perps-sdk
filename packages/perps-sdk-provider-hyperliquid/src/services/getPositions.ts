import {
  getAssets as coreGetAssets,
  type PerpsSDKClient,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HlClearinghouseState } from '../types/index.js'
import { mapPosition, perpsDexNames, requireAsset } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

export interface GetPositionsParams {
  address: Address
  /** Filter to a single canonical `Asset.assetId` (e.g. `'BTC'`, `'xyz:PURR'`). */
  assetId?: string
  /** Page size hint surfaced on the response. Hyperliquid returns all open positions in one call, so pagination is never required. */
  limit?: number
}

/**
 * Fetch open positions across every supported perps sub-dex for `address`,
 * normalised into `PositionsResponse`. Zero-size entries are dropped. The
 * backend's enriched asset list supplies the sub-dex fan-out and display
 * fields; only `clearinghouseState` is read direct from Hyperliquid.
 */
export const getPositions = async (
  client: PerpsSDKClient,
  apiUrl: string,
  params: GetPositionsParams,
  options?: SDKRequestOptions
): Promise<PositionsResponse> => {
  const { assets } = await coreGetAssets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byAssetId = new Map(assets.map((a) => [a.assetId, a]))
  const infoOpts = hlInfoOptions(client, options)

  const stateResults = await Promise.all(
    perpsDexNames(assets).map((name) =>
      infoRequest<HlClearinghouseState>(
        apiUrl,
        {
          type: 'clearinghouseState',
          user: params.address,
          ...(name ? { dex: name } : {}),
        },
        infoOpts
      )
    )
  )

  let positions = stateResults
    .flatMap((state) =>
      state.assetPositions
        .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
        .map((ap) => mapPosition(ap))
    )
    .map((pos) => ({
      ...pos,
      asset: requireAsset(byAssetId, pos.asset.assetId),
    }))

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
