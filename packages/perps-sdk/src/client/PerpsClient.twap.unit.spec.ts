import type {
  ActionStep,
  CreateActionRequest,
  CreateActionResponse,
  ExecuteActionRequest,
  Provider,
} from '@lifi/perps-types'
import {
  ActionType,
  OrderSide,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestAgentProvider } from '../../test/agentProvider.js'
import {
  mockCreateOrderResponse,
  mockProviders,
  server,
} from '../../test/handlers.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const PROVIDER = 'hyperliquid'
const MARKET = { marketId: 'BTC', categoryId: PROVIDER }

const twapDescriptor = (type: ActionType): Provider['actions'][number] => ({
  type,
  signers: [PerpsSigner.SDK],
  signingMethod: SigningMethod.EIP712,
})

const providersWithTwap: Provider[] = mockProviders.providers.map((provider) =>
  provider.key === PROVIDER
    ? {
        ...provider,
        actions: [
          ...provider.actions,
          twapDescriptor(ActionType.PLACE_TWAP_ORDER),
          twapDescriptor(ActionType.CANCEL_TWAP_ORDER),
        ],
      }
    : provider
)

const actionResponse = (action: ActionType): CreateActionResponse => ({
  // `mockCreateOrderResponse.actions` is always a single Eip712ActionStep in
  // this fixture; overriding just `action` keeps that shape, which the
  // general `ActionStep` union type can't express through a bare `.map`.
  actions: mockCreateOrderResponse.actions.map(
    (step) => ({ ...step, action }) as ActionStep
  ),
})

describe('PerpsClient TWAP wrappers', () => {
  let client: PerpsClient
  let createRequest: CreateActionRequest | undefined
  let executeRequest: ExecuteActionRequest | undefined

  beforeEach(async () => {
    const provider = createTestAgentProvider({ type: PROVIDER })
    await provider.createAgent(ADDRESS)
    client = new PerpsClient({
      integrator: 'twap-test',
      apiKey: 'test-key',
      providers: [provider],
    })
    createRequest = undefined
    executeRequest = undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/providers`, () =>
        HttpResponse.json({ providers: providersWithTwap })
      ),
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        createRequest = (await request.json()) as CreateActionRequest
        return HttpResponse.json(actionResponse(createRequest.action))
      }),
      http.post(`${DEFAULT_API_URL}/executeAction`, async ({ request }) => {
        executeRequest = (await request.json()) as ExecuteActionRequest
        return HttpResponse.json({
          results: [
            {
              action: executeRequest.action,
              success: true,
              ...(executeRequest.action === ActionType.PLACE_TWAP_ORDER
                ? { twapId: '3156' }
                : {}),
            },
          ],
        })
      })
    )
  })

  it('routes placeTwapOrder through the generic action pipeline and preserves twapId', async () => {
    const result = await client.placeTwapOrder({
      provider: PROVIDER,
      address: ADDRESS,
      market: MARKET,
      side: OrderSide.BUY,
      size: '0.25',
      durationSeconds: 900,
      randomize: true,
    })

    expect(createRequest).toMatchObject({
      provider: PROVIDER,
      address: ADDRESS,
      action: ActionType.PLACE_TWAP_ORDER,
      params: {
        market: MARKET,
        side: OrderSide.BUY,
        size: '0.25',
        durationSeconds: 900,
        randomize: true,
      },
    })
    expect(executeRequest?.action).toBe(ActionType.PLACE_TWAP_ORDER)
    expect(result.results).toEqual([
      {
        action: ActionType.PLACE_TWAP_ORDER,
        success: true,
        twapId: '3156',
      },
    ])
    const [placeResult] = result.results
    if (!placeResult.success) {
      throw new Error(`TWAP placement failed: ${placeResult.error}`)
    }
    expect(placeResult.twapId).toBe('3156')
  })

  it('routes cancelTwapOrder through the generic action pipeline', async () => {
    await client.cancelTwapOrder({
      provider: PROVIDER,
      address: ADDRESS,
      market: MARKET,
      twapId: '3156',
    })

    expect(createRequest).toMatchObject({
      action: ActionType.CANCEL_TWAP_ORDER,
      params: { market: MARKET, twapId: '3156' },
    })
    expect(executeRequest?.action).toBe(ActionType.CANCEL_TWAP_ORDER)
  })
})
