import type { OrderStatus, OrdersResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'
import { ACTIVE_ORDER_STATUSES } from '../utils/orderClassification.js'

/**
 * Parameters for {@link getOrders}.
 *
 * @public
 */
export interface GetOrdersParams {
  provider: string
  address: Address
  statuses?: OrderStatus[]
  /** Optional opaque `Market.id` filter, not a display symbol. */
  marketId?: string
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
}

/**
 * Read account orders with active lifecycle statuses as the default filter.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @throws {PerpsError} `SetupRequired` when the venue needs a credential (a
 *   Lighter auth token or an Ondo session) and none is stored.
 * @throws {PerpsError} `Unauthorized` when the venue rejects the credential.
 * @throws {PerpsError} `AccountNotFound` when the wallet has no venue account.
 */
export async function getOrders(
  client: PerpsSDKClient,
  params: GetOrdersParams,
  options?: SDKRequestOptions
): Promise<OrdersResponse> {
  return requireProvider(client, params.provider).getOrders(
    {
      address: params.address,
      statuses: params.statuses ?? [...ACTIVE_ORDER_STATUSES],
      marketId: params.marketId,
      limit: params.limit,
      cursor: params.cursor,
    },
    options
  )
}
