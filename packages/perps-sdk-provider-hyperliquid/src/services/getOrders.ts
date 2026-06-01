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
  requireMarket,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

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
    .map((o) => {
      const order = mapOpenOrder(o)
      return {
        ...order,
        market: requireMarket(byMarketId, order.market.id),
      }
    })

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerOrder(o))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          market: requireMarket(byMarketId, order.market.id),
        }
      }),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          market: requireMarket(byMarketId, order.market.id),
        }
      }),
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
