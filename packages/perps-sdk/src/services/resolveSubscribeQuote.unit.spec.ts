import type {
  Market,
  OrderbookResponse,
  PerpsMarket,
  SubscriptionEvent,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import type { SubscriptionListener } from '../websocket/types.js'
import {
  QUOTE_THROTTLE_MS,
  resolveSubscribeQuote,
} from './resolveSubscribeQuote.js'

const client = createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

const BTC_PERP: PerpsMarket = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 5,
  markPrice: '100',
  maxLeverage: 50,
  onlyIsolated: false,
  funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
}

const BOOK: OrderbookResponse = {
  provider: 'hyperliquid',
  marketId: 'BTC',
  bids: [
    { price: '99', size: '1' },
    { price: '98', size: '2' },
  ],
  asks: [
    { price: '100', size: '1' },
    { price: '101', size: '2' },
  ],
  timestamp: 1704067200000,
}

const bookEvent = (data: OrderbookResponse): SubscriptionEvent => ({
  channel: 'orderbook',
  data,
})

const installMarkets = (markets: Market[]) => {
  server.use(
    http.get(`${DEFAULT_API_URL}/markets`, () => HttpResponse.json({ markets }))
  )
}

const FEE = { maker: '0.00015', taker: '0.00045' }
const PARAMS = {
  symbol: 'BTC',
  side: 'buy',
  size: 201,
  type: 'perps',
} as const

const setup = async () => {
  installMarkets([BTC_PERP])
  let listener: SubscriptionListener = () => {}
  const wireUnsub = vi.fn()
  const subscribe = vi.fn(
    async (_sub: unknown, l: SubscriptionListener): Promise<() => void> => {
      listener = l
      return wireUnsub
    }
  )
  const onQuote = vi.fn()
  const unsubscribe = await resolveSubscribeQuote(
    client,
    'hyperliquid',
    { subscribe },
    PARAMS,
    FEE,
    onQuote
  )
  return {
    subscribe,
    wireUnsub,
    onQuote,
    unsubscribe,
    push: (data: OrderbookResponse) => listener(bookEvent(data)),
    pushRaw: (event: SubscriptionEvent) => listener(event),
  }
}

describe('resolveSubscribeQuote', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribes to the orderbook channel of the resolved market', async () => {
    const { subscribe } = await setup()

    expect(subscribe).toHaveBeenCalledWith(
      { channel: 'orderbook', dex: 'hyperliquid', marketId: 'BTC' },
      expect.any(Function)
    )
  })

  it('emits a Quote built from each book update via the one-shot transform', async () => {
    const { onQuote, push } = await setup()

    push(BOOK)

    expect(onQuote).toHaveBeenCalledTimes(1)
    const quote = onQuote.mock.calls[0][0]
    expect(quote.marketId).toBe('BTC')
    expect(quote.type).toBe('perps')
    // 100 USD @100 + 101 USD @101 → vwap 100.5.
    expect(quote.expectedFillPrice).toBe('100.5')
    expect(Number(quote.feeUsd)).toBeCloseTo(201 * 0.00045)
    expect(quote.funding).toEqual(BTC_PERP.funding)
    expect(quote.insufficientLiquidity).toBe(false)
  })

  it('ignores events from other channels', async () => {
    const { onQuote, pushRaw } = await setup()

    pushRaw({ channel: 'prices', data: {} })

    expect(onQuote).not.toHaveBeenCalled()
  })

  it('throttles emissions and flushes the latest book on the trailing edge', async () => {
    const { onQuote, push } = await setup()
    vi.useFakeTimers()

    push(BOOK)
    expect(onQuote).toHaveBeenCalledTimes(1)

    push({ ...BOOK, asks: [{ price: '110', size: '10' }] })
    push({ ...BOOK, asks: [{ price: '120', size: '10' }] })
    expect(onQuote).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(QUOTE_THROTTLE_MS)
    expect(onQuote).toHaveBeenCalledTimes(2)
    expect(onQuote.mock.calls[1][0].expectedFillPrice).toBe('120')
  })

  it('tears down the underlying subscription exactly once and cancels a pending emission', async () => {
    const { onQuote, push, wireUnsub, unsubscribe } = await setup()
    vi.useFakeTimers()

    push(BOOK)
    push({ ...BOOK, asks: [{ price: '110', size: '10' }] })
    expect(onQuote).toHaveBeenCalledTimes(1)

    unsubscribe()
    unsubscribe()

    expect(wireUnsub).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(QUOTE_THROTTLE_MS * 2)
    expect(onQuote).toHaveBeenCalledTimes(1)
  })

  it('throws MarketNotFound when no market matches the symbol+type', async () => {
    installMarkets([BTC_PERP])

    await expect(
      resolveSubscribeQuote(
        client,
        'hyperliquid',
        { subscribe: vi.fn() },
        { ...PARAMS, symbol: 'DOGE' },
        FEE,
        vi.fn()
      )
    ).rejects.toThrow(
      /No perps market found on 'hyperliquid' for symbol 'DOGE'/
    )
  })
})
