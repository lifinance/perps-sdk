import type {
  Address,
  AssetDisplay,
  OpenOrder,
  OrdersResponse,
  TriggerOrder,
} from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import {
  isTriggerType,
  mapOpenOrder,
  mapOrderType,
  mapTriggerOrder,
} from '../mappers/index.js'
import type {
  HlFrontendOpenOrder,
  HlFrontendOpenOrders,
} from '../types/index.js'
import {
  type AssetEnrichmentMaps,
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../utils/assetLookups.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'
import { getSupportedSubDexes } from '../utils/subdexes.js'

export interface GetOrdersParams {
  address: Address
  symbol?: string
  limit?: number
}

const enrichAsset = (
  assetId: string,
  maps: AssetEnrichmentMaps
): AssetDisplay => ({
  assetId,
  market: maps.assetMarketMap.get(assetId) ?? '',
  displaySymbol: resolveDisplaySymbol(assetId, maps),
  displayQuote: resolveDisplayQuote(assetId, maps),
})

/**
 * Fetch open + trigger orders across every supported perps sub-dex for
 * `address`, normalised into `OrdersResponse`. Trigger orders that appear as
 * children of a parent limit order (Hyperliquid's `normalTpsl` flow) are
 * extracted and surfaced alongside top-level trigger orders.
 */
export const getOrders = async (
  apiUrl: string,
  params: GetOrdersParams,
  options?: InfoRequestOptions
): Promise<OrdersResponse> => {
  const dexNames = await getSupportedSubDexes(apiUrl, options)

  const [ordersResults, enrichmentMaps] = await Promise.all([
    Promise.all(
      dexNames.map((name) =>
        infoRequest<HlFrontendOpenOrders>(
          apiUrl,
          {
            type: 'frontendOpenOrders',
            user: params.address,
            ...(name ? { dex: name } : {}),
          },
          options
        )
      )
    ),
    buildAssetEnrichmentMaps(apiUrl, options),
  ])

  const raw: HlFrontendOpenOrder[] = ordersResults.flat()

  const childOids = new Set<number>()
  for (const o of raw) {
    for (const child of o.children) {
      childOids.add(child.oid)
    }
  }

  const nonChild = raw.filter((o) => !childOids.has(o.oid))

  let openOrders: OpenOrder[] = nonChild
    .filter((o) => !isTriggerType(mapOrderType(o.orderType)))
    .map((o) => {
      const order = mapOpenOrder(o)
      return {
        ...order,
        asset: enrichAsset(order.asset.assetId, enrichmentMaps),
      }
    })

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerType(mapOrderType(o.orderType)))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: enrichAsset(order.asset.assetId, enrichmentMaps),
        }
      }),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: enrichAsset(order.asset.assetId, enrichmentMaps),
        }
      }),
  ]

  if (params.symbol !== undefined) {
    openOrders = openOrders.filter((o) => o.asset.assetId === params.symbol)
    triggerOrders = triggerOrders.filter(
      (o) => o.asset.assetId === params.symbol
    )
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
