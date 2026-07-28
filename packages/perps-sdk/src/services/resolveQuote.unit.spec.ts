import type {
  Market,
  MarketContext,
  OrderbookResponse,
  PerpsMarket,
  SpotMarket,
} from '@lifi/perps-types'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { resolveQuote } from './resolveQuote.js'

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
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

// Same displaySymbol on the spot leg — disambiguated by `type`.
const BTC_SPOT: SpotMarket = {
  providerId: 'hyperliquid',
  id: '@1',
  categoryId: 'spot',
  baseAsset: {
    providerId: 'hyperliquid',
    id: '1',
    displaySymbol: 'BTC',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: '0',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 2,
}

const PRICES: MarketContext[] = [
  {
    marketId: 'BTC',
    midPrice: '100',
    markPrice: '100',
    funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
  },
  { marketId: '@1', midPrice: '100', markPrice: '100' },
]

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

const installMarketAndBook = (markets: Market[], book: OrderbookResponse) => {
  server.use(
    http.get(`${DEFAULT_API_URL}/markets`, () =>
      HttpResponse.json({ markets })
    ),
    http.get(`${DEFAULT_API_URL}/orderbook`, () => HttpResponse.json(book)),
    http.get(`${DEFAULT_API_URL}/marketsContext`, () =>
      HttpResponse.json({ prices: PRICES })
    )
  )
}

const FEE = { maker: '0.00015', taker: '0.00045' }

describe('resolveQuote', () => {
  it('resolves a perps symbol, walks the asks for a buy, and applies the taker fee', async () => {
    installMarketAndBook([BTC_PERP, BTC_SPOT], BOOK)

    const quote = await resolveQuote(
      client,
      'hyperliquid',
      { symbol: 'BTC', side: 'buy', size: 201, type: 'perps' },
      FEE
    )

    expect(quote.marketId).toBe('BTC')
    expect(quote.type).toBe('perps')
    // 100 USD @100 + 101 USD @101 → vwap 100.5, 2 base.
    expect(quote.expectedFillPrice).toBe('100.5')
    expect(Number(quote.priceImpactBps)).toBeCloseTo(50)
    expect(Number(quote.feeUsd)).toBeCloseTo(201 * 0.00045)
    expect(quote.funding).toEqual(PRICES[0].funding)
    expect(quote.insufficientLiquidity).toBe(false)
  })

  it('scopes resolution by type — spot picks the @1 market with null funding', async () => {
    installMarketAndBook([BTC_PERP, BTC_SPOT], { ...BOOK, marketId: '@1' })

    const quote = await resolveQuote(
      client,
      'hyperliquid',
      { symbol: 'BTC', side: 'buy', size: 50, type: 'spot' },
      FEE
    )

    expect(quote.marketId).toBe('@1')
    expect(quote.funding).toBeNull()
  })

  it('walks the bids for a sell', async () => {
    installMarketAndBook([BTC_PERP], BOOK)

    const quote = await resolveQuote(
      client,
      'hyperliquid',
      { symbol: 'BTC', side: 'sell', size: 99, type: 'perps' },
      FEE
    )

    expect(quote.expectedFillPrice).toBe('99')
    expect(Number(quote.priceImpactBps)).toBeCloseTo(100)
  })

  it('flags insufficient liquidity when the book is too thin', async () => {
    installMarketAndBook([BTC_PERP], BOOK)

    const quote = await resolveQuote(
      client,
      'hyperliquid',
      { symbol: 'BTC', side: 'buy', size: 100_000, type: 'perps' },
      FEE
    )

    expect(quote.insufficientLiquidity).toBe(true)
  })

  it('throws MarketNotFound when no market matches the symbol+type', async () => {
    installMarketAndBook([BTC_PERP], BOOK)

    await expect(
      resolveQuote(
        client,
        'hyperliquid',
        { symbol: 'DOGE', side: 'buy', size: 100, type: 'perps' },
        FEE
      )
    ).rejects.toThrow(
      /No perps market found on 'hyperliquid' for symbol 'DOGE'/
    )
  })
})
