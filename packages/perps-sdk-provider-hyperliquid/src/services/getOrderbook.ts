import { PerpsError } from '@lifi/perps-sdk'
import type { OrderbookResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { HlL2Book } from '@lifi/perps-types/providers/hyperliquid'
import { MAX_ORDERBOOK_DEPTH, PROVIDER_KEY } from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'
import { purrSpotOverride } from '../spot.js'

export interface GetOrderbookParams {
  symbol: string
  depth?: number
}

/**
 * Fetch the L2 orderbook for `symbol`. Depth is clamped to
 * `MAX_ORDERBOOK_DEPTH` (100) per side. Hyperliquid returns `null` for
 * unknown markets — this raises a typed `MarketNotFound` error instead of
 * leaking the upstream shape.
 */
export const getOrderbook = async (
  apiUrl: string,
  params: GetOrderbookParams,
  options?: InfoRequestOptions
): Promise<OrderbookResponse> => {
  const raw = await infoRequest<HlL2Book | null>(
    apiUrl,
    { type: 'l2Book', coin: purrSpotOverride(params.symbol) },
    options
  )

  if (raw === null) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `Orderbook not found: ${params.symbol}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  const depth = Math.min(
    params.depth ?? MAX_ORDERBOOK_DEPTH,
    MAX_ORDERBOOK_DEPTH
  )
  const [bids, asks] = raw.levels

  return {
    provider: PROVIDER_KEY,
    assetId: params.symbol,
    bids: bids.slice(0, depth).map((l) => ({ price: l.px, size: l.sz })),
    asks: asks.slice(0, depth).map((l) => ({ price: l.px, size: l.sz })),
    timestamp: raw.time,
  }
}
