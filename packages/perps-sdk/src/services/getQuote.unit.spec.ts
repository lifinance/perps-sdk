import type { Quote } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from '../types/provider.js'
import { getQuote } from './getQuote.js'

const mockQuote = {
  provider: 'hyperliquid',
  symbol: 'BTC',
  marketId: 'BTC',
  type: 'perps',
  side: 'buy',
  sizeUsd: '10000',
  baseSize: '0.1',
  markPrice: '100000',
  expectedFillPrice: '100050',
  priceImpactBps: '5',
  feeTier: { maker: '0.00015', taker: '0.00045' },
  isDefaultFeeTier: true,
  feeUsd: '4.5',
  funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
  insufficientLiquidity: false,
  timestamp: 1700000000000,
} as const satisfies Quote

const makeClient = () => {
  const getQuoteSpy = vi.fn(async (): Promise<Quote> => mockQuote)
  const plugin = {
    type: 'hyperliquid',
    bind: vi.fn(),
    getQuote: getQuoteSpy,
  } as unknown as PerpsProviderPlugin
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getQuoteSpy }
}

describe('getQuote', () => {
  it('delegates to the venue plugin with the symbol/side/size/type', async () => {
    const { client, getQuoteSpy } = makeClient()

    const result = await getQuote(client, {
      provider: 'hyperliquid',
      symbol: 'BTC',
      side: 'buy',
      size: 10_000,
      type: 'perps',
    })

    expect(result).toEqual(mockQuote)
    expect(getQuoteSpy).toHaveBeenCalledWith(
      { symbol: 'BTC', side: 'buy', size: 10_000, type: 'perps' },
      undefined
    )
  })

  it('forwards request options to the plugin', async () => {
    const { client, getQuoteSpy } = makeClient()
    const controller = new AbortController()

    await getQuote(
      client,
      {
        provider: 'hyperliquid',
        symbol: 'BTC',
        side: 'sell',
        size: 500,
        type: 'perps',
      },
      { signal: controller.signal }
    )

    expect(getQuoteSpy).toHaveBeenCalledWith(
      { symbol: 'BTC', side: 'sell', size: 500, type: 'perps' },
      { signal: controller.signal }
    )
  })

  it('throws when no provider plugin is registered', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    await expect(
      getQuote(client, {
        provider: 'hyperliquid',
        symbol: 'BTC',
        side: 'buy',
        size: 100,
        type: 'perps',
      })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
