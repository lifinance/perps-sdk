import {
  ActionType,
  type CreateVoteActionResponse,
  type SubmitVoteResponse,
  type VoteParams,
  type VoteSignedTypedData,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

/**
 * Request the backend to build the unsigned `Vote` EIP-712 typed-data for a
 * provider vote. Provider-independent — no provider key on the request itself;
 * the subject is named by {@link VoteParams.voteType} + `provider`. The
 * returned `typedData` is signed client-side and submitted via {@link vote}.
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function createVoteAction(
  client: PerpsSDKClient,
  params: VoteParams,
  options?: SDKRequestOptions
): Promise<CreateVoteActionResponse> {
  return request<CreateVoteActionResponse>(
    client.config,
    `${client.config.apiUrl}/createAction`,
    {
      method: 'POST',
      body: JSON.stringify({
        action: ActionType.VOTE,
        params,
      }),
    },
    options
  )
}

/**
 * Parameters for {@link vote}: the original {@link VoteParams} plus the
 * client-signed `Vote` typed-data returned by {@link createVoteAction}.
 *
 * @public
 */
export interface VoteSubmitParams extends VoteParams {
  typedData: VoteSignedTypedData
}

/**
 * Submit a signed provider vote to the backend `POST /vote`. The signed
 * message is never auto-retried (a transport failure could mean the vote
 * already landed).
 *
 * @throws {PerpsError} On backend error responses, network, or parsing errors.
 * @public
 */
export async function vote(
  client: PerpsSDKClient,
  params: VoteSubmitParams,
  options?: SDKRequestOptions
): Promise<SubmitVoteResponse> {
  return request<SubmitVoteResponse>(
    client.config,
    `${client.config.apiUrl}/vote`,
    {
      method: 'POST',
      retry: false,
      body: JSON.stringify({
        voteType: params.voteType,
        provider: params.provider,
        direction: params.direction,
        voter: params.voter,
        typedData: params.typedData,
      }),
    },
    options
  )
}
