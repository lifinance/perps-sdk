import type {
  ActionParamsMap,
  ActionType,
  CreateActionResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link createAction}.
 *
 * @public
 */
export interface CreateActionParams<T extends ActionType = ActionType> {
  provider: string
  address: Address
  /** Optional provider-owned signer address sent to the backend. */
  signerAddress?: Address
  action: T
  /** Action-specific payload matching `action`. */
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
export async function createAction<T extends ActionType>(
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
