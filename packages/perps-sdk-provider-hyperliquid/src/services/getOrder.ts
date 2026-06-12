import {
  getMarketRegistry,
  PerpsError,
  type ProviderGetOrderParams,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type { Order } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlOrderStatusResponse } from '../types/index.js'
import { mapOrder } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getOrder}.
 *
 * @public
 */
export type GetOrderParams = ProviderGetOrderParams

/**
 * Read getOrder direct from the Hyperliquid REST API.
 *
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getOrder = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetOrderParams,
  options?: SDKRequestOptions
): Promise<Order> => {
  const oid = Number.parseInt(params.id, 10)
  if (Number.isNaN(oid)) {
    const err = new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid order ID: ${params.id}. Must be a numeric oid.`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  const status = await infoRequest<HlOrderStatusResponse>(
    apiUrl,
    { type: 'orderStatus', user: params.address, oid },
    hlInfoOptions(client, options)
  )

  if (status.status !== 'order') {
    const err = new PerpsError(
      PerpsErrorCode.OrderNotFound,
      `Order not found: ${params.id}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  const registry = getMarketRegistry(client, PROVIDER_KEY)
  await registry.sync()
  return mapOrder(status.order, registry.require(status.order.order.coin))
}
