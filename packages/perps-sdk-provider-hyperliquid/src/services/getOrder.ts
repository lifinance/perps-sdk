import { PerpsError } from '@lifi/perps-sdk'
import type { Order } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HlOrderStatusResponse } from '../types/index.js'
import { enrichAsset, type HlAssetContext } from '../utils/assetContext.js'
import { mapOrder } from '../utils/index.js'
import { type InfoRequestOptions, infoRequest } from '../utils/infoClient.js'

export interface GetOrderParams {
  address: Address
  id: string
}

export const getOrder = async (
  apiUrl: string,
  params: GetOrderParams,
  ctx: HlAssetContext,
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
  return { ...order, asset: enrichAsset(order.asset.assetId, ctx) }
}
