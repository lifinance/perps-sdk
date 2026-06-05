import {
  ActionType,
  type CreateActionResponse,
  META_PROVIDER,
  type VoteParams,
  voteTypeFields,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockCreateOrderResponse, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { createAction } from './createAction.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const client = createPerpsClient({
  integrator: 'test-app',
  apiKey: 'test-key',
  retry: false,
})

describe('createAction', () => {
  it('POSTs the action payload and returns the create response', async () => {
    let method: string | undefined
    let body: unknown

    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        method = request.method
        body = await request.json()
        return HttpResponse.json(mockCreateOrderResponse)
      })
    )

    const result = await createAction(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      action: ActionType.PLACE_ORDER,
      params: { foo: 'bar' } as never,
    })

    expect(method).toBe('POST')
    expect(body).toEqual({
      provider: 'hyperliquid',
      address: ADDRESS,
      action: ActionType.PLACE_ORDER,
      params: { foo: 'bar' },
    })
    expect(result).toEqual(mockCreateOrderResponse)
  })

  it('includes signerAddress in the body when provided', async () => {
    const SIGNER = '0x000000000000000000000000000000000000dEaD' as const
    let body: { signerAddress?: string } = {}

    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        body = (await request.json()) as { signerAddress?: string }
        return HttpResponse.json(mockCreateOrderResponse)
      })
    )

    await createAction(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      signerAddress: SIGNER,
      action: ActionType.PLACE_ORDER,
      params: {} as never,
    })

    expect(body.signerAddress).toBe(SIGNER)
  })

  it('POSTs a META_VOTE on the generic path with the meta sentinel as provider', async () => {
    const voteParams: VoteParams = {
      targetProvider: 'driftv2',
      direction: 'up',
      voteType: 'provider',
    }
    const mockVoteCreateResponse: CreateActionResponse = {
      actions: [
        {
          action: ActionType.META_VOTE,
          typedData: {
            domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
            types: { Vote: voteTypeFields },
            primaryType: 'Vote',
            message: {
              targetProvider: 'driftv2',
              direction: 'up',
              voteType: 'provider',
              voter: ADDRESS,
              timestamp: 1_900_000_000_000,
            },
          },
        },
      ],
    }

    let url: string | undefined
    let body: unknown
    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        url = request.url
        body = await request.json()
        return HttpResponse.json(mockVoteCreateResponse)
      })
    )

    const result = await createAction(client, {
      provider: META_PROVIDER,
      address: ADDRESS,
      action: ActionType.META_VOTE,
      params: voteParams,
    })

    // The vote rides /createAction, never a bespoke /vote route.
    expect(url?.endsWith('/createAction')).toBe(true)
    expect(body).toEqual({
      provider: 'meta',
      address: ADDRESS,
      action: ActionType.META_VOTE,
      params: voteParams,
    })
    expect(result.actions[0].action).toBe(ActionType.META_VOTE)
    expect(result.actions[0]).toMatchObject({
      typedData: { primaryType: 'Vote' },
    })
  })

  it('propagates a backend error as a PerpsError', async () => {
    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, () =>
        HttpResponse.json(
          { code: 1003, message: 'invalid order', tool: 'hyperliquid' },
          { status: 400 }
        )
      )
    )

    await expect(
      createAction(client, {
        provider: 'hyperliquid',
        address: ADDRESS,
        action: ActionType.PLACE_ORDER,
        params: {} as never,
      })
    ).rejects.toThrow('invalid order')
  })
})
