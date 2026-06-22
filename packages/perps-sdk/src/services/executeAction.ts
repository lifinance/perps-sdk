import type {
  ActionType,
  ExecuteActionResponse,
  SignedActionStep,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { request } from '../transport/request.js'
import type { SDKRequestOptions } from '../types/config.js'
import type { PerpsSDKClient } from '../types/provider.js'

/**
 * Parameters for {@link executeAction}.
 *
 * @public
 */
export interface ExecuteActionParams {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  actions: SignedActionStep[]
}

/**
 * Submit client-signed `ActionStep`s to the backend for execution. This is a
 * money-moving write — the request is never auto-retried (the signed bytes
 * could already have landed on a transport failure).
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
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
      // Money-moving write: a network/5xx failure is outcome-unknown, so the
      // request must never be auto-resubmitted (the signed bytes could already
      // have landed). Retries stay enabled for reads and `createAction`.
      retry: false,
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
