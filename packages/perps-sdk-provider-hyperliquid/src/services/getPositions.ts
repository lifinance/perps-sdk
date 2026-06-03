import {
  getMarkets as coreGetMarkets,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { PositionsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlClearinghouseState } from '../types/index.js'
import { mapPosition, perpsDexNames, requireMarket } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getPositions}.
 *
 * @public
 */
export interface GetPositionsParams {
  address: Address
  /** Filter to a single opaque `Market.id` (e.g. `'BTC'`, `'xyz:PURR'`). */
  marketId?: string
  /** Page size hint surfaced on the response. Hyperliquid returns all open positions in one call, so pagination is never required. */
  limit?: number
}

/**
 * Fetch open positions across every supported perps sub-dex for `address`,
 * normalised into `PositionsResponse`. Zero-size entries are dropped. The
 * backend's enriched asset list supplies the sub-dex fan-out and display
 * fields; only `clearinghouseState` is read direct from Hyperliquid.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getPositions = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetPositionsParams,
  options?: SDKRequestOptions
): Promise<PositionsResponse> => {
  const { markets } = await coreGetMarkets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byMarketId = new Map(markets.map((m) => [m.id, m]))
  const infoOpts = hlInfoOptions(client, options)

  const stateResults = await Promise.all(
    perpsDexNames(markets).map((name) =>
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

  let positions = stateResults.flatMap((state) =>
    state.assetPositions
      .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
      .map((ap) => mapPosition(ap, requireMarket(byMarketId, ap.position.coin)))
  )

  if (params.marketId !== undefined) {
    positions = positions.filter((p) => p.market.id === params.marketId)
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
