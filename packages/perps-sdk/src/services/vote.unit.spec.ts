import {
  ActionType,
  type CreateVoteActionResponse,
  type SubmitVoteResponse,
  VoteDirection,
  type VoteSignedTypedData,
  VoteType,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { createVoteAction, vote } from './vote.js'

const VOTER = '0x1234567890123456789012345678901234567890' as const

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

const mockCreateVoteResponse: CreateVoteActionResponse = {
  typedData: {
    domain: { name: 'LI.FI Perps', version: '1', chainId: 1 },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      Vote: [
        { name: 'action', type: 'string' },
        { name: 'voteType', type: 'string' },
        { name: 'provider', type: 'string' },
        { name: 'direction', type: 'string' },
        { name: 'voter', type: 'address' },
        { name: 'timestamp', type: 'uint256' },
      ],
    },
    primaryType: 'Vote',
    message: {
      action: 'Upvote hyperliquid',
      voteType: VoteType.PROVIDER,
      provider: 'hyperliquid',
      direction: VoteDirection.UP,
      voter: VOTER,
      timestamp: 1_717_000_000_000,
    },
  },
}

const signedTypedData: VoteSignedTypedData = {
  ...mockCreateVoteResponse.typedData,
  signature: `0x${'ab'.repeat(65)}`,
}

const mockVoteResponse: SubmitVoteResponse = { success: true }

describe('createVoteAction', () => {
  it('POSTs the VOTE action to /createAction with no provider key and returns the typed-data payload', async () => {
    let method: string | undefined
    let body: unknown

    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        method = request.method
        body = await request.json()
        return HttpResponse.json(mockCreateVoteResponse)
      })
    )

    const result = await createVoteAction(client, {
      voteType: VoteType.PROVIDER,
      provider: 'hyperliquid',
      direction: VoteDirection.UP,
      voter: VOTER,
    })

    expect(method).toBe('POST')
    expect(body).toEqual({
      action: ActionType.VOTE,
      params: {
        voteType: VoteType.PROVIDER,
        provider: 'hyperliquid',
        direction: VoteDirection.UP,
        voter: VOTER,
      },
    })
    expect(body).not.toHaveProperty('provider')
    expect(result).toEqual(mockCreateVoteResponse)
    expect(result.typedData.primaryType).toBe('Vote')
    expect(result.typedData.message.action).toBe('Upvote hyperliquid')
  })

  it('propagates a backend error as a PerpsError', async () => {
    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, () =>
        HttpResponse.json(
          { code: 2002, message: 'unknown provider', tool: 'unknown' },
          { status: 400 }
        )
      )
    )

    await expect(
      createVoteAction(client, {
        voteType: VoteType.PROVIDER,
        provider: 'nope',
        direction: VoteDirection.DOWN,
        voter: VOTER,
      })
    ).rejects.toThrow('unknown provider')
  })
})

describe('vote', () => {
  it('POSTs the signed message and direction to /vote', async () => {
    let method: string | undefined
    let body: unknown

    server.use(
      http.post(`${DEFAULT_API_URL}/vote`, async ({ request }) => {
        method = request.method
        body = await request.json()
        return HttpResponse.json(mockVoteResponse)
      })
    )

    const result = await vote(client, {
      voteType: VoteType.PROVIDER,
      provider: 'hyperliquid',
      direction: VoteDirection.DOWN,
      voter: VOTER,
      typedData: signedTypedData,
    })

    expect(method).toBe('POST')
    expect(body).toEqual({
      voteType: VoteType.PROVIDER,
      provider: 'hyperliquid',
      direction: VoteDirection.DOWN,
      voter: VOTER,
      typedData: signedTypedData,
    })
    expect(result).toEqual(mockVoteResponse)
  })

  it('propagates a backend error as a PerpsError', async () => {
    server.use(
      http.post(`${DEFAULT_API_URL}/vote`, () =>
        HttpResponse.json(
          { code: 2010, message: 'signature invalid', tool: 'unknown' },
          { status: 400 }
        )
      )
    )

    await expect(
      vote(client, {
        voteType: VoteType.PROVIDER,
        provider: 'hyperliquid',
        direction: VoteDirection.UP,
        voter: VOTER,
        typedData: signedTypedData,
      })
    ).rejects.toThrow('signature invalid')
  })
})
