import type {
  PlaceOrderParams as ActionPlaceOrderParams,
  CreateActionResponse,
} from '@lifi/perps-types'
import {
  ActionType,
  MarginMode,
  OrderSide,
  OrderType,
  UserActionStatus,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { createTestAgentProvider } from '../../test/agentProvider.js'
import { mockCreateOrderResponse, server } from '../../test/handlers.js'
import type { ClientPlaceOrderParams } from '../index.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'

const ADDRESS = '0x1234567890123456789012345678901234567890'
const PROVIDER = 'lighter'

describe('PerpsClient.placeOrder', () => {
  let client: PerpsClient
  let createRequest: unknown

  beforeEach(async () => {
    const provider = createTestAgentProvider({ type: PROVIDER })
    await provider.createAgent(ADDRESS)
    client = new PerpsClient({ providers: [provider] })
    createRequest = undefined

    server.use(
      http.post(`${DEFAULT_API_URL}/createAction`, async ({ request }) => {
        createRequest = await request.json()
        return HttpResponse.json(
          mockCreateOrderResponse satisfies CreateActionResponse
        )
      }),
      http.post(`${DEFAULT_API_URL}/executeAction`, () =>
        HttpResponse.json({
          results: [
            {
              action: ActionType.PLACE_ORDER,
              status: UserActionStatus.Submitted,
              orderId: '9',
            },
          ],
        })
      )
    )
  })

  it('types the native IMF with the action parameter contract', () => {
    expectTypeOf<
      ClientPlaceOrderParams['initialMarginFractionBps']
    >().toEqualTypeOf<ActionPlaceOrderParams['initialMarginFractionBps']>()
  })

  it('forwards the native IMF unchanged in the action parameters', async () => {
    const params: ClientPlaceOrderParams = {
      provider: PROVIDER,
      address: ADDRESS,
      market: { marketId: 'ETH', categoryId: 'perps' },
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.1',
      price: '3000',
      leverage: 15,
      initialMarginFractionBps: '667',
      marginMode: MarginMode.ISOLATED,
    }

    const result = await client.placeOrder(params)

    expect(createRequest).toMatchObject({
      provider: PROVIDER,
      address: ADDRESS,
      action: ActionType.PLACE_ORDER,
    })
    expect(createRequest).toHaveProperty('params', params)
    expect(result.results).toEqual([
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '9',
      },
    ])
  })
})
