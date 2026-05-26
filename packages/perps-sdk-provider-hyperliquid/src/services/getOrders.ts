import type { OpenOrder, OrdersResponse, TriggerOrder } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type {
  HlFrontendOpenOrder,
  HlFrontendOpenOrders,
} from '../types/index.js'
import { enrichAsset, type HlAssetContext } from '../utils/assetContext.js'
import {
  isTriggerType,
  mapOpenOrder,
  mapOrderType,
  mapTriggerOrder,
} from '../utils/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'

export interface GetOrdersParams {
  address: Address
  /** Optional filter — canonical `Asset.assetId`. */
  assetId?: string
  limit?: number
}

/**
 * Fetch open + trigger orders across every supported perps sub-dex for
 * `address`, normalised into `OrdersResponse`. Trigger orders that appear as
 * children of a parent limit order (Hyperliquid's `normalTpsl` flow) are
 * extracted and surfaced alongside top-level trigger orders. Market metadata
 * (`ctx`) is sourced backend-side; only `frontendOpenOrders` is read direct.
 */
export const getOrders = async (
  apiUrl: string,
  params: GetOrdersParams,
  ctx: HlAssetContext,
  options?: InfoRequestOptions
): Promise<OrdersResponse> => {
  const ordersResults = await Promise.all(
    ctx.dexNames.map((name) =>
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
    .filter((o) => !isTriggerType(mapOrderType(o.orderType)))
    .map((o) => {
      const order = mapOpenOrder(o)
      return {
        ...order,
        asset: enrichAsset(order.asset.assetId, ctx),
      }
    })

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerType(mapOrderType(o.orderType)))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: enrichAsset(order.asset.assetId, ctx),
        }
      }),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: enrichAsset(order.asset.assetId, ctx),
        }
      }),
  ]

  if (params.assetId !== undefined) {
    openOrders = openOrders.filter((o) => o.asset.assetId === params.assetId)
    triggerOrders = triggerOrders.filter(
      (o) => o.asset.assetId === params.assetId
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
