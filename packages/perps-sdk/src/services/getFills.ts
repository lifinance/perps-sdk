import type { FillsResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import { requireProvider } from '../client/requireProvider.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link getFills}.
 *
 * @public
 */
export interface GetFillsParams {
  provider: string
  address: Address
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
  /** Include fills at or after this Unix timestamp in milliseconds. */
  startTime?: number
  /** Include fills at or before this Unix timestamp in milliseconds. */
  endTime?: number
}

/**
 * Get order fills for an account. Delegates to the registered venue plugin
 * (direct-to-venue); requires the provider plugin to be registered on the
 * client.
 *
 * @throws {PerpsError} When the provider plugin is not registered, or on
 *   backend / network / parsing errors.
 * @example
 * ```ts
 * const { items, pagination } = await getFills(client, {
 *   provider: 'hyperliquid',
 *   address: '0x1234...',
 *   limit: 50,
 * })
 * ```
 * @public
 */
export async function getFills(
  client: PerpsSDKClient,
  params: GetFillsParams,
  options?: SDKRequestOptions
): Promise<FillsResponse> {
  return requireProvider(client, params.provider).getFills(
    {
      address: params.address,
      limit: params.limit,
      cursor: params.cursor,
      startTime: params.startTime,
      endTime: params.endTime,
    },
    options
  )
}
