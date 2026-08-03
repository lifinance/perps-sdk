import { createPerpsClient } from '@lifi/perps-sdk'
import {
  type Market,
  OrderSide,
  PositionMarginAdjustment,
  TwapOrderStatus,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterProvider } from './LighterProvider.js'
import type { LtOrder } from './types/order.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const REST_URL = 'https://lighter.test'
const MARKET: Market = {
  providerId: 'lighter',
  id: '1',
  categoryId: 'lighter',
  baseAsset: {
    providerId: 'lighter',
    id: '1',
    displaySymbol: 'ETH',
    logoURI: '',
    name: 'Ether',
    decimals: 18,
  },
  quoteAsset: {
    providerId: 'lighter',
    id: '3',
    displaySymbol: 'USDC',
    logoURI: '',
    name: 'USD Coin',
    decimals: 6,
  },
  szDecimals: 4,
  priceDecimals: 2,
  maxLeverage: 20,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

const order = (type: string, orderIndex: number): LtOrder => ({
  order_index: orderIndex,
  client_order_index: 0,
  order_id: `lt-${orderIndex}`,
  client_order_id: '0',
  market_index: 1,
  owner_account_index: 42,
  initial_base_amount: '0.5',
  price: '0',
  nonce: 10,
  remaining_base_amount: '0.3',
  is_ask: false,
  filled_base_amount: '0.2',
  filled_quote_amount: '700',
  side: 'buy',
  type,
  time_in_force: 'good-till-time',
  reduce_only: false,
  trigger_price: '0',
  order_expiry: 1_775_000_900_000,
  status: 'open',
  trigger_status: 'na',
  trigger_time: 0,
  parent_order_index: 0,
  parent_order_id: '',
  to_trigger_order_id_0: '',
  to_trigger_order_id_1: '',
  to_cancel_order_id_0: '',
  block_height: 1,
  timestamp: 1_775_000_000,
  created_at: 1_775_000_000,
  updated_at: 1_775_000_100,
  transaction_time: 1_775_000_000,
})

describe('Lighter getRunningTwaps', () => {
  it('queries active account orders and excludes twap-sub children', async () => {
    const requests: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      requests.push(url)
      if (url.includes('/markets')) {
        return Response.json({ markets: [MARKET] })
      }
      if (url.includes('/api/v1/account?')) {
        return Response.json({
          code: 200,
          accounts: [{ index: 42, positions: [] }],
        })
      }
      if (url.includes('/api/v1/accountActiveOrders')) {
        return Response.json({
          code: 0,
          next_cursor: '',
          orders: [
            order('twap', 88),
            {
              ...order('twap', 90),
              filled_base_amount: '0',
              filled_quote_amount: '0',
            },
            order('twap-sub', 89),
          ],
        })
      }
      throw new Error(`Unhandled URL: ${url}`)
    }
    const client = createPerpsClient({
      integrator: 'twap-test',
      apiKey: 'test-key',
      retry: false,
      fetch: fetchImpl,
      providers: [
        lighterProvider({ restUrl: REST_URL, authToken: 'read-token' }),
      ],
    })
    const provider = client.getProvider('lighter')
    if (provider === undefined) {
      throw new Error('lighter provider was not registered')
    }
    if (provider.getRunningTwaps === undefined) {
      throw new Error('lighter provider does not implement getRunningTwaps')
    }

    const result = await provider.getRunningTwaps({
      address: ADDRESS,
      marketId: '1',
    })

    expect(
      requests.find((url) => url.includes('/api/v1/accountActiveOrders'))
    ).toContain('account_index=42&market_id=1&auth=read-token')
    expect(result).toEqual([
      {
        twapId: '88',
        market: expect.objectContaining({ id: '1' }),
        side: OrderSide.BUY,
        totalSize: '0.5',
        filledSize: '0.2',
        avgFillPrice: '3500',
        startedAt: new Date(1_775_000_000_000).toISOString(),
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
      {
        twapId: '90',
        market: expect.objectContaining({ id: '1' }),
        side: OrderSide.BUY,
        totalSize: '0.5',
        filledSize: '0',
        startedAt: new Date(1_775_000_000_000).toISOString(),
        durationSeconds: 900,
        status: TwapOrderStatus.RUNNING,
      },
    ])
  })
})
