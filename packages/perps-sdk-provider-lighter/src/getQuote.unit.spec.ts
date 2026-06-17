import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIGHTER_BASE_FEE_TIER } from './constants.js'
import { lighterProvider } from './LighterProvider.js'

const MARKETS = {
  markets: [
    {
      providerId: 'lighter',
      id: '1',
      categoryId: 'lighter',
      baseAsset: {
        providerId: 'lighter',
        id: '1',
        displaySymbol: 'BTC',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'lighter',
        id: '0',
        displaySymbol: 'USDC',
        logoURI: '',
      },
      szDecimals: 5,
      maxLeverage: 50,
      onlyIsolated: false,
    },
  ],
}

const PRICES = {
  prices: [
    {
      marketId: '1',
      price: '100',
      markPrice: '100',
      funding: { rate: '0.0002', nextFundingTime: 1704067200000 },
    },
  ],
}

const BOOK = {
  provider: 'lighter',
  marketId: '1',
  bids: [
    { price: '99', size: '1' },
    { price: '98', size: '3' },
  ],
  asks: [{ price: '100', size: '10' }],
  timestamp: 1704067200000,
}

const installMock = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/orderbook')) {
      return new Response(JSON.stringify(BOOK), { status: 200 })
    }
    if (url.includes('/prices')) {
      return new Response(JSON.stringify(PRICES), { status: 200 })
    }
    if (url.includes('/markets')) {
      return new Response(JSON.stringify(MARKETS), { status: 200 })
    }
    throw new Error(`unexpected request: ${url}`)
  })

const makeProvider = () => {
  const provider = lighterProvider()
  const client = createPerpsClient({
    integrator: 'test',
    apiKey: 'k',
    retry: false,
    providers: [provider],
  })
  return client.getProvider('lighter')!
}

describe('lighterProvider.getQuote', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('quotes a buy at the public base tier (zero taker fee)', async () => {
    const spy = installMock()
    restore = () => spy.mockRestore()

    const quote = await makeProvider().getQuote({
      symbol: 'BTC',
      side: 'buy',
      size: 500,
      type: 'perps',
    })

    expect(quote.provider).toBe('lighter')
    expect(quote.marketId).toBe('1')
    expect(quote.expectedFillPrice).toBe('100')
    expect(quote.feeTier).toEqual(LIGHTER_BASE_FEE_TIER)
    expect(quote.feeUsd).toBe('0')
    expect(quote.isDefaultFeeTier).toBe(true)
    expect(quote.funding).toEqual(PRICES.prices[0].funding)
  })

  it('flags insufficient liquidity for an oversized sell', async () => {
    const spy = installMock()
    restore = () => spy.mockRestore()

    const quote = await makeProvider().getQuote({
      symbol: 'BTC',
      side: 'sell',
      size: 100_000,
      type: 'perps',
    })

    expect(quote.insufficientLiquidity).toBe(true)
  })

  it('throws when no perps market matches the symbol', async () => {
    const spy = installMock()
    restore = () => spy.mockRestore()

    await expect(
      makeProvider().getQuote({
        symbol: 'ETH',
        side: 'buy',
        size: 10,
        type: 'perps',
      })
    ).rejects.toThrow(/No perps market found/)
  })
})
