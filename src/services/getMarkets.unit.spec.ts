import { describe, expect, it } from 'vitest'
import { mockMarkets } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getMarkets } from './getMarkets.js'

describe('getMarkets', () => {
  const client = createPerpsClient({ integrator: 'test-app' })

  it('should return list of markets', async () => {
    const result = await getMarkets(client, { dex: 'hyperliquid' })

    expect(result).toEqual(mockMarkets)
    expect(result.markets).toHaveLength(2)
  })

  it('should include market details', async () => {
    const result = await getMarkets(client, { dex: 'hyperliquid' })
    const btc = result.markets.find((m) => m.symbol === 'BTC')

    expect(btc).toBeDefined()
    expect(btc!.markPrice).toBe('95000.00')
    expect(btc!.maxLeverage).toBe(50)
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getMarkets(client, { dex: 'hyperliquid' }, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
