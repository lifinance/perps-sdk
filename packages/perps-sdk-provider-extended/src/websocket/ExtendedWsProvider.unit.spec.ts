import { createMemoryStorage, createPerpsClient } from '@lifi/perps-sdk'
import {
  type OrderbookResponse,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  PositionSide,
  type SubscriptionEvent,
} from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signingKey } from '../../test/fixtures/starkFixtures.js'
import {
  MARKETS_RESPONSE,
  OPEN_ORDERS,
  OPEN_POSITION,
  venueBody,
} from '../../test/venueFixtures.js'
import {
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from '../auth/ExtendedCredentialStore.js'
import { DEFAULT_EXTENDED_API_URL } from '../constants.js'
import { ExtendedWsProvider } from './ExtendedWsProvider.js'

const ADDRESS = '0x1Ed5dAf4D58d3Dd03De489101167A1258a840340'
const CREDENTIALS: ExtendedCredentials = {
  starkPrivateKey: signingKey.starkPrivateKey,
  starkPublicKey: signingKey.starkPublicKey,
  accountId: '330870',
  positionId: '430876',
  apiKey: 'test-api-key',
}

async function setup(credentials: ExtendedCredentials | null = CREDENTIALS) {
  const storage = createMemoryStorage()
  const store = new ExtendedCredentialStore(storage, DEFAULT_EXTENDED_API_URL)
  if (credentials !== null) {
    await store.set(ADDRESS, credentials)
  }
  const provider = new ExtendedWsProvider(
    'ws://127.0.0.1:1',
    'extended',
    { storage },
    createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })
  )
  // The socket never opens: subscribes send inline through the stub.
  const rws = Reflect.get(provider, 'rws')
  rws.close()
  const sent: Record<string, unknown>[] = []
  rws.send = (raw: string) => sent.push(JSON.parse(raw))
  rws.ready = vi.fn().mockResolvedValue(undefined)
  rws.getStatus = () => 'connected'
  rws.reconnect = vi.fn()
  const feed = (frame: string) =>
    Reflect.get(provider, 'handleMessage').call(provider, frame)
  return { provider, store, sent, feed, rws }
}

const collect = () => {
  const events: SubscriptionEvent[] = []
  return { events, listener: (event: SubscriptionEvent) => events.push(event) }
}

/** Frame text as the venue sends it, with `seq` and the subscription name. */
const frame = (
  subscription: string,
  seq: number,
  type: string,
  data: unknown
) =>
  venueBody(data).replace(
    /^\{"status":"OK",/,
    `{"type":"${type}","seq":${seq},"subscription":"${subscription}",`
  )

describe('ExtendedWsProvider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify(MARKETS_RESPONSE))
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('subscribes with a JSON-RPC frame for each public stream', async () => {
    const { provider, sent } = await setup()
    const { listener } = collect()

    await provider.subscribe(
      { dex: 'extended', channel: 'orderbook', marketId: 'ETH-USD' },
      listener
    )
    await provider.subscribe(
      {
        dex: 'extended',
        channel: 'candle',
        marketId: 'BTC-USD',
        interval: '1d',
      },
      listener
    )

    expect(sent).toEqual([
      {
        jsonrpc: '2.0',
        id: '1',
        method: 'subscribe',
        params: {
          scope: 'orderbooks',
          selector: { market: 'ETH-USD', depth: 'full', rfqOnly: false },
        },
      },
      {
        jsonrpc: '2.0',
        id: '2',
        method: 'subscribe',
        params: {
          scope: 'candles',
          selector: { market: 'BTC-USD', type: 'last', interval: 'PT24H' },
        },
      },
    ])
  })

  it('refuses an interval that Extended does not stream', async () => {
    const { provider } = await setup()

    await expect(
      provider.subscribe(
        {
          dex: 'extended',
          channel: 'candle',
          marketId: 'BTC-USD',
          interval: '3m',
        },
        () => {}
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
  })

  describe('orderbook', () => {
    // Levels from a live ETH-USD snapshot and its next deltas.
    const SNAPSHOT = {
      t: 'SNAPSHOT',
      m: 'ETH-USD',
      b: [
        { q: '0.462', p: '1758.7' },
        { q: '22.075', p: '1758.8' },
      ],
      a: [
        { q: '27.862', p: '1759.1' },
        { q: '22.085', p: '1758.9' },
      ],
      d: 'f',
    }

    const lastBook = (events: SubscriptionEvent[]) =>
      events.at(-1)?.data as OrderbookResponse

    it('keeps the book from a snapshot and its deltas, best price first', async () => {
      const { provider, feed } = await setup()
      const { events, listener } = collect()
      await provider.subscribe(
        { dex: 'extended', channel: 'orderbook', marketId: 'ETH-USD' },
        listener
      )

      feed(frame('orderbooks.ETH-USD', 1, 'ORDERBOOKS.SNAPSHOT', SNAPSHOT))
      expect(lastBook(events)).toMatchObject({
        bids: [
          { price: '1758.8', size: '22.075' },
          { price: '1758.7', size: '0.462' },
        ],
        asks: [
          { price: '1758.9', size: '22.085' },
          { price: '1759.1', size: '27.862' },
        ],
      })

      feed(
        frame('orderbooks.ETH-USD', 2, 'ORDERBOOKS.DELTA', {
          t: 'DELTA',
          m: 'ETH-USD',
          b: [
            { q: '0.462', p: '1758.8', c: '22.537' },
            { q: '-0.462', p: '1758.7', c: '0' },
          ],
          a: [],
          d: 'f',
        })
      )
      expect(lastBook(events).bids).toEqual([
        { price: '1758.8', size: '22.537' },
      ])
    })

    it('ignores a delta that arrives before any snapshot', async () => {
      const { provider, feed } = await setup()
      const { events, listener } = collect()
      await provider.subscribe(
        { dex: 'extended', channel: 'orderbook', marketId: 'ETH-USD' },
        listener
      )

      feed(
        frame('orderbooks.ETH-USD', 1, 'ORDERBOOKS.DELTA', {
          t: 'DELTA',
          m: 'ETH-USD',
          b: [{ q: '1', p: '1758.8', c: '1' }],
          a: [],
        })
      )

      expect(events).toEqual([])
    })

    it('reconnects on a gap in the connection sequence', async () => {
      const { provider, feed, rws } = await setup()
      await provider.subscribe(
        { dex: 'extended', channel: 'orderbook', marketId: 'ETH-USD' },
        () => {}
      )

      feed(frame('orderbooks.ETH-USD', 1, 'ORDERBOOKS.SNAPSHOT', SNAPSHOT))
      feed(frame('orderbooks.ETH-USD', 3, 'ORDERBOOKS.SNAPSHOT', SNAPSHOT))

      expect(rws.reconnect).toHaveBeenCalledTimes(1)
    })
  })

  it('merges mark price and funding into the market context', async () => {
    const { provider, feed } = await setup()
    const { events, listener } = collect()
    await provider.subscribe(
      { dex: 'extended', channel: 'marketContext', marketId: 'BTC-USD' },
      listener
    )

    feed(
      frame('funding-rates.BTC-USD', 1, 'FUNDING_RATES', {
        m: 'BTC-USD',
        f: '0.000013',
        T: 1795013083107,
      })
    )
    feed(
      frame('prices.mark.BTC-USD', 2, 'PRICES.MP', {
        m: 'BTC-USD',
        p: '63132.596699000001',
        ts: 0,
      })
    )

    expect(events).toEqual([
      {
        channel: 'marketContext',
        data: {
          provider: 'extended',
          marketId: 'BTC-USD',
          markPrice: '63132.596699000001',
          funding: { rate: '0.000013', nextFundingTime: 1795014000000 },
        },
      },
    ])
  })

  it('keeps public trade ids above 2^53 exact', async () => {
    const { provider, feed } = await setup()
    const { events, listener } = collect()
    await provider.subscribe(
      { dex: 'extended', channel: 'trades', marketId: 'BTC-USD' },
      listener
    )

    feed(
      '{"type":"TRADES","data":[{"i":2123065412999450626,"m":"BTC-USD","S":"BUY","tT":"TRADE","T":1795013213764,"p":"63180","q":"0.00012"}],"ts":1795013269715,"seq":0,"subscription":"trades.BTC-USD"}'
    )

    expect(events[0]).toEqual({
      channel: 'trades',
      data: [
        {
          provider: 'extended',
          marketId: 'BTC-USD',
          price: '63180',
          size: '0.00012',
          timestamp: 1795013213764,
          side: 'buy',
          id: '2123065412999450626',
        },
      ],
    })
  })

  it('routes candles by their subscription', async () => {
    const { provider, feed } = await setup()
    const { events, listener } = collect()
    await provider.subscribe(
      {
        dex: 'extended',
        channel: 'candle',
        marketId: 'BTC-USD',
        interval: '1m',
      },
      listener
    )

    feed(
      frame('candles.last.BTC-USD.PT1M', 1, 'CANDLES', [
        {
          o: '63163',
          l: '63104.5',
          h: '63241.5',
          c: '63173.5',
          v: '0.16222',
          T: 1795013220000,
        },
      ])
    )

    expect(events).toEqual([
      {
        channel: 'candle',
        data: {
          t: 1795013220000,
          o: '63163',
          h: '63241.5',
          l: '63104.5',
          c: '63173.5',
          v: '0.16222',
        },
      },
    ])
  })

  describe('account channels', () => {
    it('require the setup when this device holds no credentials', async () => {
      const { provider, sent } = await setup(null)

      await expect(
        provider.subscribe(
          { dex: 'extended', channel: 'positions', address: ADDRESS },
          () => {}
        )
      ).rejects.toMatchObject({ code: PerpsErrorCode.SetupRequired })
      expect(sent).toEqual([])
    })

    it('share one account subscription that carries the API key', async () => {
      const { provider, sent } = await setup()

      await provider.subscribe(
        { dex: 'extended', channel: 'positions', address: ADDRESS },
        () => {}
      )
      await provider.subscribe(
        { dex: 'extended', channel: 'orderUpdates', address: ADDRESS },
        () => {}
      )

      expect(sent).toEqual([
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'subscribe',
          params: {
            scope: 'account',
            selector: { account: '330870' },
            apiKey: 'test-api-key',
          },
        },
      ])
    })

    it('map the account frames to positions, orders and the summary', async () => {
      const { provider, feed } = await setup()
      const positions = collect()
      const orders = collect()
      const summary = collect()
      await provider.subscribe(
        { dex: 'extended', channel: 'positions', address: ADDRESS },
        positions.listener
      )
      await provider.subscribe(
        { dex: 'extended', channel: 'orderUpdates', address: ADDRESS },
        orders.listener
      )
      await provider.subscribe(
        { dex: 'extended', channel: 'accountSummary', address: ADDRESS },
        summary.listener
      )

      feed(
        frame('account.330870', 0, 'ACCOUNT.ORDER', {
          isSnapshot: true,
          orders: OPEN_ORDERS,
        })
      )
      feed(
        frame('account.330870', 1, 'ACCOUNT.POSITION', {
          isSnapshot: true,
          positions: [OPEN_POSITION],
        })
      )
      feed(
        frame('account.330870', 2, 'ACCOUNT.BALANCE', {
          isSnapshot: true,
          balance: {
            collateralName: 'USD',
            balance: '100',
            equity: '140',
            availableForTrade: '76',
            availableForWithdrawal: '76',
            unrealisedPnl: '40',
            initialMargin: '64',
            updatedTime: 1794998617564,
          },
        })
      )
      feed(
        frame('account.330870', 3, 'ACCOUNT.POSITION', {
          isSnapshot: false,
          positions: [{ ...OPEN_POSITION, size: '0' }],
        })
      )

      expect(
        orders.events[0]?.channel === 'orderUpdates' &&
          orders.events[0].data.orders.map((order) => [
            order.orderId,
            order.type,
            order.status,
          ])
      ).toEqual([
        ['2123010000000000002', OrderType.TAKE_PROFIT_LIMIT, OrderStatus.OPEN],
        ['2123010000000000002', OrderType.STOP_MARKET, OrderStatus.OPEN],
        ['2123010000000000003', OrderType.STOP_LIMIT, OrderStatus.OPEN],
      ])
      expect(positions.events.map((event) => event.data)).toEqual([
        [
          expect.objectContaining({
            side: PositionSide.LONG,
            size: '0.01',
            marginUsed: '64',
          }),
        ],
        [],
      ])
      expect(summary.events).toEqual([
        {
          channel: 'accountSummary',
          data: {
            portfolioValue: '140',
            availableMargin: '76',
            marginUsed: '64',
            unrealizedPnl: '40',
          },
        },
      ])
    })

    it('reject every account channel and remove the credentials when Extended refuses the key', async () => {
      const { provider, feed, store } = await setup()
      const onError = vi.fn()
      await provider.subscribe(
        { dex: 'extended', channel: 'positions', address: ADDRESS },
        () => {},
        undefined,
        onError
      )
      await provider.subscribe(
        { dex: 'extended', channel: 'fills', address: ADDRESS },
        () => {},
        undefined,
        onError
      )

      feed(
        '{"id":"1","error":{"code":-32602,"message":"Invalid auth token"},"jsonrpc":"2.0"}'
      )
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))

      expect(onError.mock.calls.map(([error]) => error.code)).toEqual([
        PerpsErrorCode.Unauthorized,
        PerpsErrorCode.Unauthorized,
      ])
      expect(await store.get(ADDRESS)).toBeNull()
    })
  })
})
