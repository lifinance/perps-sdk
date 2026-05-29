import {
  getAssets as coreGetAssets,
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
  requireAsset,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

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
  const { assets } = await coreGetAssets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byAssetId = new Map(assets.map((a) => [a.assetId, a]))
  const infoOpts = hlInfoOptions(client, options)

  const ordersResults = await Promise.all(
    perpsDexNames(assets).map((name) =>
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
        asset: requireAsset(byAssetId, order.asset.assetId),
      }
    })

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerOrder(o))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: requireAsset(byAssetId, order.asset.assetId),
        }
      }),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => {
        const order = mapTriggerOrder(o)
        return {
          ...order,
          asset: requireAsset(byAssetId, order.asset.assetId),
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
