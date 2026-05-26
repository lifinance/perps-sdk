import type {
  ActionType,
  ExecuteActionResponse,
  SignedActionStep,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface ExecuteActionParams {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  actions: SignedActionStep[]
}

export async function executeAction(
  client: PerpsSDKClient,
  params: ExecuteActionParams,
  options?: SDKRequestOptions
): Promise<ExecuteActionResponse> {
  return request<ExecuteActionResponse>(
    client.config,
    `${client.config.apiUrl}/executeAction`,
    {
      method: 'POST',
      body: JSON.stringify({
        provider: params.provider,
        address: params.address,
        signerAddress: params.signerAddress,
        action: params.action,
        actions: params.actions,
      }),
    },
    options
  )
}
