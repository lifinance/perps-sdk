import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HYPERLIQUID_FEE_TIER_FALLBACK } from './constants.js'
import { hyperliquidProvider } from './HyperliquidProvider.js'

const MARKETS = {
  markets: [
    {
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
    },
  ],
}

const BOOK = {
  provider: 'hyperliquid',
  marketId: 'BTC',
  bids: [{ price: '99', size: '5' }],
  asks: [
    { price: '100', size: '1' },
    { price: '101', size: '2' },
  ],
  timestamp: 1704067200000,
}

const installMock = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/orderbook')) {
      return new Response(JSON.stringify(BOOK), { status: 200 })
    }
    if (url.includes('/markets')) {
      return new Response(JSON.stringify(MARKETS), { status: 200 })
    }
    throw new Error(`unexpected request: ${url}`)
  })

const makeProvider = () => {
  const provider = hyperliquidProvider()
  const client = createPerpsClient({
    integrator: 'test',
    apiKey: 'k',
    retry: false,
    providers: [provider],
  })
  return client.getProvider('hyperliquid')!
}

describe('hyperliquidProvider.getQuote', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('resolves BTC perps, walks the asks, and applies the HL base taker fee', async () => {
    const spy = installMock()
    restore = () => spy.mockRestore()

    const quote = await makeProvider().getQuote({
      symbol: 'BTC',
      side: 'buy',
      size: 201,
      type: 'perps',
    })

    expect(quote.provider).toBe('hyperliquid')
    expect(quote.marketId).toBe('BTC')
    expect(quote.expectedFillPrice).toBe('100.5')
    expect(quote.feeTier).toEqual(HYPERLIQUID_FEE_TIER_FALLBACK)
    expect(quote.isDefaultFeeTier).toBe(true)
    expect(Number(quote.feeUsd)).toBeCloseTo(201 * 0.00045)
    expect(quote.funding).toEqual(MARKETS.markets[0].funding)
  })

  it('throws when the symbol does not match a perps market', async () => {
    const spy = installMock()
    restore = () => spy.mockRestore()

    await expect(
      makeProvider().getQuote({
        symbol: 'DOGE',
        side: 'buy',
        size: 10,
        type: 'perps',
      })
    ).rejects.toThrow(/No perps market found/)
  })
})
