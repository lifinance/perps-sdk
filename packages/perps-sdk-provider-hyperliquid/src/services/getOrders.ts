import {
  getMarkets as coreGetMarkets,
  type PerpsSDKClient,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { OpenOrder, OrdersResponse, TriggerOrder } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type {
  HlFrontendOpenOrder,
  HlFrontendOpenOrders,
} from '../types/index.js'
import {
  isTriggerOrder,
  mapOpenOrder,
  mapTriggerOrder,
  perpsDexNames,
  resolveEntityMarket,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getOrders}.
 *
 * @public
 */
export interface GetOrdersParams {
  address: Address
  /** Optional filter — opaque `Market.id`. */
  marketId?: string
  limit?: number
}

/**
 * Fetch open + trigger orders across every supported perps sub-dex for
 * `address`, normalised into `OrdersResponse`. Trigger orders that appear as
 * children of a parent limit order (Hyperliquid's `normalTpsl` flow) are
 * extracted and surfaced alongside top-level trigger orders. The backend's
 * enriched asset list supplies the sub-dex fan-out and display fields; only
 * `frontendOpenOrders` is read direct.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getOrders = async (
  client: PerpsSDKClient,
  apiUrl: string,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> => {
  const { markets } = await coreGetMarkets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byMarketId = new Map(markets.map((m) => [m.id, m]))
  const infoOpts = hlInfoOptions(client, options)

  const ordersResults = await Promise.all(
    perpsDexNames(markets).map((name) =>
      infoRequest<HlFrontendOpenOrders>(
        apiUrl,
        {
          type: 'frontendOpenOrders',
          user: params.address,
          ...(name ? { dex: name } : {}),
        },
        infoOpts
      )
    )
  )

  const raw: HlFrontendOpenOrder[] = ordersResults.flat()

  const childOids = new Set<number>()
  for (const o of raw) {
    for (const child of o.children) {
      childOids.add(child.oid)
    }
  }

  const nonChild = raw.filter((o) => !childOids.has(o.oid))

  let openOrders: OpenOrder[] = nonChild
    .filter((o) => !isTriggerOrder(o))
    .map((o) => resolveEntityMarket(mapOpenOrder(o), byMarketId))

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerOrder(o))
      .map((o) => resolveEntityMarket(mapTriggerOrder(o), byMarketId)),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => resolveEntityMarket(mapTriggerOrder(o), byMarketId)),
  ]

  if (params.marketId !== undefined) {
    openOrders = openOrders.filter((o) => o.market.id === params.marketId)
    triggerOrders = triggerOrders.filter((o) => o.market.id === params.marketId)
  }

  return {
    provider: PROVIDER_KEY,
    openOrders,
    triggerOrders,
    pagination: {
      limit: params.limit ?? openOrders.length + triggerOrders.length,
      hasMore: false,
    },
  }
}
