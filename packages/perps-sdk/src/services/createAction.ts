import type { ActionParamsMap, CreateActionResponse } from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

/**
 * Parameters for {@link createAction}.
 *
 * @public
 */
export interface CreateActionParams<
  T extends keyof ActionParamsMap = keyof ActionParamsMap,
> {
  provider: string
  address: Address
  signerAddress?: Address
  action: T
  params: ActionParamsMap[T]
}

/**
 * Request the backend to build the unsigned `ActionStep`s for an action. The
 * returned steps are signed client-side and submitted via
 * {@link executeAction}.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function createAction<T extends keyof ActionParamsMap>(
  client: PerpsSDKClient,
  params: CreateActionParams<T>,
  options?: SDKRequestOptions
): Promise<CreateActionResponse> {
  return request<CreateActionResponse>(
    client.config,
    `${client.config.apiUrl}/createAction`,
    {
      method: 'POST',
      body: JSON.stringify({
        provider: params.provider,
        address: params.address,
        signerAddress: params.signerAddress,
        action: params.action,
        params: params.params,
      }),
    },
    options
  )
}
