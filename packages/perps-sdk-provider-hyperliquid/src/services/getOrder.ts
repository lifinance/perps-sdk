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
import type {
  HlOrderStatusResponse,
  HlTwapHistoryEntry,
} from '../types/index.js'
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
  const isClientId = /^0x[0-9a-fA-F]{32}$/.test(params.id)
  const oid = isClientId ? params.id : Number(params.id)
  if (
    !isClientId &&
    (!/^[0-9]+$/.test(params.id) || !Number.isSafeInteger(oid))
  ) {
    const err = new PerpsError(
      PerpsErrorCode.ValidationError,
      `Invalid order ID: ${params.id}. Expected a numeric oid or a 128-bit cloid.`
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
    const history = await infoRequest<HlTwapHistoryEntry[]>(
      apiUrl,
      { type: 'twapHistory', user: params.address },
      hlInfoOptions(client, options)
    )
    const twap = history.find((entry) => String(entry.twapId) === params.id)
    if (twap !== undefined) {
      const registry = getMarketRegistry(client, PROVIDER_KEY)
      await registry.sync()
      return mapOrder(twap, registry.require(twap.state.coin))
    }
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
