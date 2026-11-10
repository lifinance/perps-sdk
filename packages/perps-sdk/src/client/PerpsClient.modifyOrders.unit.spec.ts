import type { CreateActionResponse } from '@lifi/perps-types'
import { ActionType, UserActionStatus } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { createTestAgentProvider } from '../../test/agentProvider.js'
import { mockCreateOrderResponse, server } from '../../test/handlers.js'
import type { CancelOrdersParams, ModifyOrdersParams } from '../index.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'

const ADDRESS = '0x1234567890123456789012345678901234567890'
const PROVIDER = 'hyperliquid'

describe('PerpsClient.modifyOrders', () => {
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
        return HttpResponse.json({
          actions: mockCreateOrderResponse.actions
            .filter((step) => 'typedData' in step)
            .map((step) => ({
              ...step,
              action: ActionType.MODIFY_ORDER,
            })),
        } satisfies CreateActionResponse)
      }),
      http.post(`${DEFAULT_API_URL}/executeAction`, () =>
        HttpResponse.json({
          results: [
            {
              action: ActionType.MODIFY_ORDER,
              status: UserActionStatus.Submitted,
              orderId: '1234',
            },
          ],
        })
      )
    )
  })

  it('uses the cancel-order contract for the optional market context', () => {
    expectTypeOf<ModifyOrdersParams['assetId']>().toEqualTypeOf<
      CancelOrdersParams['assetId']
    >()
  })

  it('forwards an opaque market ID unchanged in the action parameters', async () => {
    const result = await client.modifyOrders({
      provider: PROVIDER,
      address: ADDRESS,
      assetId: 'perps:2',
      modifications: [{ id: '1234', triggerPrice: '42000.50' }],
    })

    expect(createRequest).toMatchObject({
      provider: PROVIDER,
      address: ADDRESS,
      action: ActionType.MODIFY_ORDER,
    })
    expect(createRequest).toHaveProperty('params', {
      provider: PROVIDER,
      address: ADDRESS,
      assetId: 'perps:2',
      modifications: [{ id: '1234', triggerPrice: '42000.50' }],
    })
    expect(result.results).toEqual([
      {
        action: ActionType.MODIFY_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '1234',
      },
    ])
  })

  it('preserves action parameters when the market context is absent', async () => {
    const result = await client.modifyOrders({
      provider: PROVIDER,
      address: ADDRESS,
      modifications: [{ id: '1234', price: '41000', size: '0.25' }],
    })

    expect(createRequest).toMatchObject({
      provider: PROVIDER,
      address: ADDRESS,
      action: ActionType.MODIFY_ORDER,
    })
    expect(createRequest).toHaveProperty('params', {
      provider: PROVIDER,
      address: ADDRESS,
      modifications: [{ id: '1234', price: '41000', size: '0.25' }],
    })
    expect(result.results).toEqual([
      {
        action: ActionType.MODIFY_ORDER,
        status: UserActionStatus.Submitted,
        orderId: '1234',
      },
    ])
  })
})
