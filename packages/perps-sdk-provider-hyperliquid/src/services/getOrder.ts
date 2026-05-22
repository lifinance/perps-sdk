import { PerpsError } from '@lifi/perps-sdk'
import type { Address, Order } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { HlOrderStatusResponse } from '@lifi/perps-types/providers/hyperliquid'
import {
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../assetLookups.js'
import { PROVIDER_KEY } from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'
import { mapOrder } from '../mappers/index.js'

export interface GetOrderParams {
  address: Address
  id: string
}

export const getOrder = async (
  apiUrl: string,
  params: GetOrderParams,
  options?: InfoRequestOptions
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
    options
  )

  if (status.status !== 'order') {
    const err = new PerpsError(
      PerpsErrorCode.OrderNotFound,
      `Order not found: ${params.id}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  const order = mapOrder(status.order)
  const enrichmentMaps = await buildAssetEnrichmentMaps(apiUrl, options)
  return {
    ...order,
    asset: {
      ...order.asset,
      market: enrichmentMaps.assetMarketMap.get(order.asset.assetId) ?? '',
      displaySymbol: resolveDisplaySymbol(order.asset.assetId, enrichmentMaps),
      displayQuote: resolveDisplayQuote(order.asset.assetId, enrichmentMaps),
    },
  }
}
