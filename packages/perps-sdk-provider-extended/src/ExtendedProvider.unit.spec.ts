import { createMemoryStorage, type PerpsSDKClient } from '@lifi/perps-sdk'
import {
  ActionRelay,
  ActionType,
  ActivityType,
  MarginMode,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  PerpsSigner,
  PositionSide,
  SigningMethod,
  TimeInForce,
  TriggerCondition,
  UserActionStatus,
} from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signingKey } from '../test/fixtures/starkFixtures.js'
import {
  MARKETS_RESPONSE,
  OPEN_ORDERS,
  OPEN_POSITION,
  PROVIDER_METADATA,
  recordedBody,
  venueBody,
} from '../test/venueFixtures.js'
import {
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from './auth/ExtendedCredentialStore.js'
import { DEFAULT_EXTENDED_API_URL } from './constants.js'
import { extendedProvider } from './ExtendedProvider.js'

const ADDRESS = '0x1Ed5dAf4D58d3Dd03De489101167A1258a840340'
const BACKEND = 'https://backend.test/v1/perps'
const STUB_CLIENT = { config: { apiUrl: BACKEND } } as PerpsSDKClient
const CREDENTIALS: ExtendedCredentials = {
  starkPrivateKey: signingKey.starkPrivateKey,
  starkPublicKey: signingKey.starkPublicKey,
  accountId: '330870',
  positionId: '430876',
  apiKey: 'test-api-key',
}

type Route = { status?: number; body: string }

function stubFetch(venue: Record<string, Route>) {
  const venueCalls: { path: string; apiKey: string | null }[] = []
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith(`${BACKEND}/markets`)) {
        return new Response(JSON.stringify(MARKETS_RESPONSE))
      }
      if (url.startsWith(`${BACKEND}/providers`)) {
        return new Response(JSON.stringify({ providers: [PROVIDER_METADATA] }))
      }
      const path = url.slice(DEFAULT_EXTENDED_API_URL.length)
      venueCalls.push({
        path,
        apiKey: new Headers(init?.headers).get('x-api-key'),
      })
      const route = venue[path.split('?')[0]]
      if (route === undefined) {
        return new Response('{"status":"ERROR","error":{"code":404}}', {
          status: 404,
        })
      }
      return new Response(route.body, { status: route.status ?? 200 })
    }
  )
  vi.stubGlobal('fetch', fetchMock)
  return venueCalls
}

async function setup(credentials: ExtendedCredentials | null = CREDENTIALS) {
  const storage = createMemoryStorage()
  const store = new ExtendedCredentialStore(storage, DEFAULT_EXTENDED_API_URL)
  if (credentials !== null) {
    await store.set(ADDRESS, credentials)
  }
  const provider = extendedProvider({ storage })
  provider.bind(STUB_CLIENT)
  return { provider, store }
}

const POSITIONS_ROUTE = { body: venueBody([OPEN_POSITION]) }

describe('extendedProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getAccount', () => {
    it('maps the recorded balance and an open position, with the API key on every call', async () => {
      const calls = stubFetch({
        '/api/v1/user/balance': { body: recordedBody('balance') },
        '/api/v1/user/positions': POSITIONS_ROUTE,
      })
      const { provider } = await setup()

      const account = await provider.getAccount({ address: ADDRESS })

      expect(calls.every((call) => call.apiKey === 'test-api-key')).toBe(true)
      expect(account.collateralBalances).toEqual([
        expect.objectContaining({
          categoryId: 'extended',
          units: '0.065740',
          valueUsd: '0.065740',
          transferable: '0.06574',
        }),
      ])
      expect(account.positions).toEqual([
        expect.objectContaining({
          side: PositionSide.LONG,
          size: '0.01',
          entryPrice: '60000',
          liquidationPrice: '54500',
          marginUsed: '64',
          positionValue: '640',
          marginMode: MarginMode.CROSS,
          returnOnEquity: '66.66666666666666666666666666666666666667',
        }),
      ])
      expect(account.config).toEqual({
        provider: 'extended',
        apiKeyRegistered: true,
        balance: {
          balance: '0.065740',
          equity: '0.065740',
          availableForTrade: '0.065740',
          availableForWithdrawal: '0.065740',
          unrealizedPnl: '0.000000',
          initialMargin: '0',
        },
      })
      expect(provider.getAccountSummary(account, account.positions)).toEqual({
        portfolioValue: '0.065740',
        availableMargin: '0.065740',
        marginUsed: '0',
        unrealizedPnl: '0.000000',
      })
    })

    it('reads an unfunded account (balance 404) as zero', async () => {
      stubFetch({
        '/api/v1/user/positions': { body: venueBody([]) },
      })
      const { provider } = await setup()

      const account = await provider.getAccount({ address: ADDRESS })

      expect(account.collateralBalances).toEqual([])
      expect(account.config).toEqual({
        provider: 'extended',
        apiKeyRegistered: true,
      })
    })

    it('reports an account without credentials and calls no venue route', async () => {
      const calls = stubFetch({})
      const { provider } = await setup(null)

      const account = await provider.getAccount({ address: ADDRESS })

      expect(calls).toEqual([])
      expect(account.config).toEqual({
        provider: 'extended',
        apiKeyRegistered: false,
      })
    })

    it('removes credentials that Extended refuses', async () => {
      stubFetch({
        '/api/v1/user/balance': { status: 401, body: '' },
        '/api/v1/user/positions': { status: 401, body: '' },
      })
      const { provider, store } = await setup()

      const account = await provider.getAccount({ address: ADDRESS })

      expect(account.config).toMatchObject({ apiKeyRegistered: false })
      expect(await store.get(ADDRESS)).toBeNull()
    })
  })

  describe('data reads', () => {
    it('require the setup when this device holds no credentials', async () => {
      stubFetch({})
      const { provider } = await setup(null)

      await expect(
        provider.getPositions({ address: ADDRESS })
      ).rejects.toMatchObject({ code: PerpsErrorCode.SetupRequired })
    })

    it('throw Unauthorized when Extended refuses the API key', async () => {
      stubFetch({ '/api/v1/user/positions': { status: 401, body: '' } })
      const { provider } = await setup()

      await expect(
        provider.getPositions({ address: ADDRESS })
      ).rejects.toMatchObject({ code: PerpsErrorCode.Unauthorized })
    })
  })

  describe('getOrders', () => {
    it('maps open trigger orders and the recorded history, keeping ids above 2^53 exact', async () => {
      stubFetch({
        '/api/v1/user/orders': { body: venueBody(OPEN_ORDERS) },
        '/api/v1/user/orders/history': { body: recordedBody('orders_history') },
      })
      const { provider } = await setup()

      const { orders } = await provider.getOrders({ address: ADDRESS })

      expect(
        orders.map((order) => [order.orderId, order.type, order.status])
      ).toEqual([
        ['2123010000000000002', OrderType.TAKE_PROFIT_LIMIT, OrderStatus.OPEN],
        ['2123010000000000002', OrderType.STOP_MARKET, OrderStatus.OPEN],
        ['2123010000000000003', OrderType.STOP_LIMIT, OrderStatus.OPEN],
        ['2123003046861942784', OrderType.MARKET, OrderStatus.FILLED],
        ['2123002903206629376', OrderType.MARKET, OrderStatus.FILLED],
        ['2123002619936706560', OrderType.LIMIT, OrderStatus.CANCELLED],
        ['2123002618304655360', OrderType.LIMIT, OrderStatus.CANCELLED],
      ])
      expect(orders[0]).toMatchObject({
        triggerPrice: '70000',
        limitPrice: '69900',
        triggerCondition: TriggerCondition.ABOVE,
        reduceOnly: true,
        clientOrderId: 'ua-tpsl',
      })
      expect(orders[2]).toMatchObject({
        triggerPrice: '66000',
        limitPrice: '66100',
        triggerCondition: TriggerCondition.ABOVE,
      })
      expect(orders[3]).toMatchObject({
        filledSize: '100.0000000000000000',
        remainingSize: '0',
        averagePrice: '0.0250340000000000',
        timeInForce: TimeInForce.IOC,
        reduceOnly: true,
      })
      expect(orders[5]).toMatchObject({
        statusReason: 'Cancelled.',
        timeInForce: TimeInForce.GTT,
      })
    })

    it('reads only open orders for active statuses', async () => {
      const calls = stubFetch({
        '/api/v1/user/orders': { body: venueBody(OPEN_ORDERS) },
      })
      const { provider } = await setup()

      const { orders } = await provider.getOrders({
        address: ADDRESS,
        statuses: [OrderStatus.OPEN],
      })

      expect(calls.map((call) => call.path)).toEqual(['/api/v1/user/orders'])
      expect(orders).toHaveLength(3)
    })
  })

  it('getOrder maps a 404 to OrderNotFound', async () => {
    stubFetch({})
    const { provider } = await setup()

    await expect(
      provider.getOrder({ address: ADDRESS, id: '1' })
    ).rejects.toMatchObject({ code: PerpsErrorCode.OrderNotFound })
  })

  it('getFills maps the recorded trades', async () => {
    stubFetch({ '/api/v1/user/trades': { body: recordedBody('trades') } })
    const { provider } = await setup()

    const { items, pagination } = await provider.getFills({
      address: ADDRESS,
      limit: 20,
    })

    expect(items.map((fill) => [fill.id, fill.orderId, fill.side])).toEqual([
      ['2123003049801682948', '2123003046861942784', 'SELL'],
      ['2123002905517625344', '2123002903206629376', 'BUY'],
    ])
    expect(items[0]).toMatchObject({
      size: '100.0000000000000000',
      price: '0.0250340000000000',
      liquidity: 'taker',
      fee: { amount: '0.0006250000000000', asset: 'USDC' },
    })
    expect(items[0].builderFee).toBeUndefined()
    expect(pagination.hasMore).toBe(false)
  })

  it('getActivity maps the recorded deposit and withdrawal', async () => {
    const calls = stubFetch({
      '/api/v1/user/assetOperations': {
        body: recordedBody('asset_operations'),
      },
    })
    const { provider } = await setup()

    const { items, pagination } = await provider.getActivity({
      address: ADDRESS,
    })

    expect(calls.map((call) => call.path)).toEqual([
      '/api/v1/user/assetOperations?limit=100',
    ])
    expect(pagination).toEqual({ limit: 2, hasMore: false })

    expect(items).toEqual([
      expect.objectContaining({
        id: '2123004191999299584',
        type: ActivityType.WITHDRAWAL,
        amount: '19.9',
        fee: { amount: '0.0109990000000000', asset: 'USDC' },
      }),
      expect.objectContaining({
        type: ActivityType.DEPOSIT,
        amount: '19.989996',
      }),
    ])
  })

  it('getMarketSettings reads the recorded leverage as cross', async () => {
    stubFetch({ '/api/v1/user/leverage': { body: recordedBody('leverage') } })
    const { provider } = await setup()

    expect(
      await provider.getMarketSettings({
        address: ADDRESS,
        market: { marketId: 'BTC-USD', categoryId: 'extended' },
      })
    ).toEqual({ marginMode: MarginMode.CROSS, leverage: '10' })
  })

  it('snaps on the market tick and lot', async () => {
    stubFetch({})
    const { provider } = await setup()
    const [btc] = MARKETS_RESPONSE.markets

    expect(provider.snapOrderPrice(btc, '64000.5')).toBe('64001')
    expect(provider.snapOrderSize(btc, '0.123456789')).toBe('0.12345')
  })

  it('projects both setup steps from the stored credentials', async () => {
    stubFetch({})
    const { provider } = await setup()
    const step = (type: ActionType, signingMethod: SigningMethod) => ({
      type,
      signer: PerpsSigner.USER,
      signingMethod,
      relay: ActionRelay.API,
      options: null,
      revoke: null,
    })

    expect(
      provider.projectConfig({ provider: 'extended', apiKeyRegistered: true }, [
        step(ActionType.CREATE_ACCOUNT, SigningMethod.STARK),
        step(ActionType.REGISTER_API_KEY, SigningMethod.SESSION),
      ])
    ).toEqual([
      { type: ActionType.CREATE_ACCOUNT, values: [], satisfied: true },
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: true },
    ])
  })

  describe('resolveActionRequest', () => {
    it('sends the Stark key and the position with a trading action', async () => {
      stubFetch({})
      const { provider } = await setup()

      expect(
        await provider.resolveActionRequest?.(
          ActionType.PLACE_ORDER,
          ADDRESS,
          PerpsSigner.SDK
        )
      ).toEqual({
        params: {
          starkKey: signingKey.starkPublicKey,
          positionId: '430876',
        },
      })
    })

    it.each([
      ActionType.CREATE_ACCOUNT,
      ActionType.REGISTER_API_KEY,
    ])('sends nothing for the setup step %s', async (action) => {
      stubFetch({})
      const { provider } = await setup(null)

      expect(
        await provider.resolveActionRequest?.(action, ADDRESS, PerpsSigner.USER)
      ).toEqual({})
    })
  })

  it('removes the credentials after Extended refuses the API key on an action', async () => {
    stubFetch({})
    const { provider, store } = await setup()

    await provider.onExecuteResults?.(ADDRESS, [
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Failed,
        errorCode: PerpsErrorCode.Unauthorized,
      },
    ])

    expect(await store.get(ADDRESS)).toBeNull()
  })
})
