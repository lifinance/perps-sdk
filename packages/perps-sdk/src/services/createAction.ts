import type {
  ActionParamsMap,
  ActionType,
  CreateActionResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface CreateActionParams<T extends ActionType = ActionType> {
  provider: string
  address: Address
  signerAddress?: Address
  action: T
  params: ActionParamsMap[T]
}

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
