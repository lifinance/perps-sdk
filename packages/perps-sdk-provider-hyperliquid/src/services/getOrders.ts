import { getMarketRegistry, type SDKRequestOptions } from '@lifi/perps-sdk'
import type { OpenOrder, OrdersResponse, TriggerOrder } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlFrontendOpenOrder,
  HlFrontendOpenOrders,
} from '../types/index.js'
import {
  isTriggerOrder,
  mapOpenOrder,
  mapTriggerOrder,
  perpsDexNames,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getOrders}.
 *
 * @public
 */
export interface GetOrdersParams {
  /** EVM user address whose open orders are fetched. */
  address: Address
  /** Optional filter using the normalized opaque `Market.id`. */
  marketId?: string
  /** Page-size hint; Hyperliquid returns all open orders in one response. */
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
  { client, apiUrl }: HyperliquidContext,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  const markets = await registry.sync()
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
    for (const child of o.children ?? []) {
      childOids.add(child.oid)
    }
  }

  const nonChild = raw.filter((o) => !childOids.has(o.oid))

  let openOrders: OpenOrder[] = nonChild
    .filter((o) => !isTriggerOrder(o))
    .map((o) => mapOpenOrder(o, registry.require(o.coin)))

  let triggerOrders: TriggerOrder[] = [
    ...nonChild
      .filter((o) => isTriggerOrder(o))
      .map((o) => mapTriggerOrder(o, registry.require(o.coin))),
    ...raw
      .filter((o) => childOids.has(o.oid))
      .map((o) => mapTriggerOrder(o, registry.require(o.coin))),
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
