import {
  ACTIVE_ORDER_STATUSES,
  getMarketRegistry,
  isActiveOrderStatus,
  type ProviderGetOrdersParams,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { Order, OrdersResponse } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlFrontendOpenOrders,
  HlHistoricalOrders,
  HlTwapHistoryEntry,
} from '../types/index.js'
import { mapOrder, perpsDexNames } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/** Parameters for a lifecycle-filtered Hyperliquid order read. */
export type GetOrdersParams = ProviderGetOrdersParams

/** Read regular, trigger, and TWAP orders from the requested lifecycle feeds. */
export const getOrders = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> => {
  const statuses = params.statuses ?? [...ACTIVE_ORDER_STATUSES]
  if (statuses.length === 0) {
    return {
      provider: PROVIDER_KEY,
      orders: [],
      pagination: { limit: params.limit ?? 0, hasMore: false },
    }
  }
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  const markets = await registry.sync()
  const infoOpts = hlInfoOptions(client, options)
  const active = statuses.some(isActiveOrderStatus)
  const terminal = statuses.some((status) => !isActiveOrderStatus(status))
  const [open, historical, twaps] = await Promise.all([
    active
      ? Promise.all(
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
      : [],
    terminal
      ? infoRequest<HlHistoricalOrders>(
          apiUrl,
          { type: 'historicalOrders', user: params.address },
          infoOpts
        )
      : [],
    infoRequest<HlTwapHistoryEntry[]>(
      apiUrl,
      { type: 'twapHistory', user: params.address },
      infoOpts
    ),
  ])
  const rows = new Map<string, Order>()
  for (const detail of historical) {
    const order = mapOrder(detail, registry.require(detail.order.coin))
    rows.set(order.orderId, order)
  }
  const raw = open.flat()
  const childIds = new Set(
    raw.flatMap((order) => (order.children ?? []).map((child) => child.oid))
  )
  for (const order of raw) {
    if (!childIds.has(order.oid)) {
      rows.set(String(order.oid), mapOrder(order, registry.require(order.coin)))
    }
    for (const child of order.children ?? []) {
      rows.set(
        String(child.oid),
        mapOrder(child, registry.require(child.coin), String(order.oid))
      )
    }
  }
  // TWAP ids and regular order ids occupy separate venue namespaces.
  for (const twap of twaps) {
    const order = mapOrder(twap, registry.require(twap.state.coin))
    rows.set(`twap:${order.orderId}`, order)
  }
  const matching = [...rows.values()].filter(
    (order) =>
      statuses.includes(order.status) &&
      (params.marketId === undefined || order.market.id === params.marketId)
  )
  return {
    provider: PROVIDER_KEY,
    orders: matching,
    pagination: { limit: params.limit ?? matching.length, hasMore: false },
  }
}
