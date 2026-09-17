import {
  ACTIVE_ORDER_STATUSES,
  ExplorerChainId,
  explorerTxUrl,
  getMarketRegistry,
  isActiveOrderStatus,
  type MarketRegistry,
  PerpsError,
  type ProviderGetOrdersParams,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { MarketDisplay, Order, OrdersResponse } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlExplorerTx,
  HlFrontendOpenOrders,
  HlHistoricalOrders,
  HlTwapHistoryEntry,
} from '../types/index.js'
import {
  fetchUserTransactions,
  mapOrder,
  matchOrderActionHash,
  perpsDexNames,
} from '../utils/index.js'
import {
  hlInfoOptions,
  type InfoRequestOptions,
  infoRequest,
} from '../utils/infoClient.js'

/** Parameters for a lifecycle-filtered Hyperliquid order read. */
export type GetOrdersParams = ProviderGetOrdersParams

const warned = new Set<string>()

const warnOnce = (key: string, detail?: string): void => {
  if (warned.has(key)) {
    return
  }
  warned.add(key)
  console.warn(
    `[${PROVIDER_KEY}] ${detail === undefined ? key : `${key}: ${detail}`}`
  )
}

/**
 * Map one venue row, or drop it. A coin the backend market list does not hold
 * and a row the mapper rejects each drop only their own row instead of
 * rejecting the whole page; each distinct mapper message warns once.
 */
const mapRow = (
  coin: string,
  registry: MarketRegistry,
  map: (market: MarketDisplay) => Order
): Order | undefined => {
  const market = registry.get(coin)
  if (market === undefined) {
    return undefined
  }
  try {
    return map(market)
  } catch (error) {
    if (!(error instanceof PerpsError)) {
      throw error
    }
    warnOnce(`dropped order row: ${error.message}`)
    return undefined
  }
}

/**
 * Set `explorerLink` on each row whose placement transaction the explorer
 * window still holds. One explorer read serves the whole page, and it is
 * skipped when no row carries a client order id to match on. The link is
 * supplementary, so an explorer failure warns and leaves the rows unlinked
 * instead of failing the order read.
 */
const withExplorerLinks = async (
  orders: Order[],
  address: string,
  options: InfoRequestOptions
): Promise<Order[]> => {
  if (!orders.some((order) => order.clientOrderId !== undefined)) {
    return orders
  }
  let txs: HlExplorerTx[]
  try {
    txs = await fetchUserTransactions(address, options)
  } catch (error) {
    if (!(error instanceof PerpsError)) {
      throw error
    }
    // The message stays out of the key: a transport failure names hosts and
    // ports, so keying on it would let the dedupe set grow without bound.
    warnOnce('explorer link lookup failed', error.message)
    return orders
  }
  return orders.map((order) => {
    const explorerLink = explorerTxUrl(
      ExplorerChainId.HYPERLIQUID,
      matchOrderActionHash(txs, order)
    )
    return explorerLink === undefined ? order : { ...order, explorerLink }
  })
}

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
  const keep = (key: string, order: Order | undefined): void => {
    if (order !== undefined) {
      rows.set(key, order)
    }
  }
  for (const detail of historical) {
    const key = String(detail.order.oid)
    // The feed carries one row per lifecycle transition, newest first, and a
    // terminal row shares its timestamp with the `open` row beneath it, so
    // only the first row of an id states that order's current status.
    if (rows.has(key)) {
      continue
    }
    keep(
      key,
      mapRow(detail.order.coin, registry, (market) => mapOrder(detail, market))
    )
  }
  const raw = open.flat()
  const childIds = new Set(
    raw.flatMap((order) => (order.children ?? []).map((child) => child.oid))
  )
  for (const order of raw) {
    if (!childIds.has(order.oid)) {
      keep(
        String(order.oid),
        mapRow(order.coin, registry, (market) => mapOrder(order, market))
      )
    }
    for (const child of order.children ?? []) {
      keep(
        String(child.oid),
        mapRow(child.coin, registry, (market) =>
          mapOrder(child, market, String(order.oid))
        )
      )
    }
  }
  // TWAP ids and regular order ids occupy separate venue namespaces.
  for (const twap of twaps) {
    keep(
      `twap:${twap.twapId}`,
      mapRow(twap.state.coin, registry, (market) => mapOrder(twap, market))
    )
  }
  const matching = [...rows.values()].filter(
    (order) =>
      statuses.includes(order.status) &&
      (params.marketId === undefined || order.market.id === params.marketId)
  )
  const orders = await withExplorerLinks(matching, params.address, infoOpts)
  return {
    provider: PROVIDER_KEY,
    orders,
    pagination: { limit: params.limit ?? orders.length, hasMore: false },
  }
}
