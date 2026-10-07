import { createPerpsClient } from '@lifi/perps-sdk'
import { MarginMode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterProvider } from './LighterProvider.js'
import { LT_MARGIN_MODE_CROSS } from './types/index.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const MARKET_ID = '1'

const setup = (initialMarginFraction: string) => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/account') {
      return Response.json({
        code: 200,
        accounts: [
          {
            index: 42,
            positions: [
              {
                market_id: Number(MARKET_ID),
                margin_mode: LT_MARGIN_MODE_CROSS,
                initial_margin_fraction: initialMarginFraction,
              },
            ],
          },
        ],
      })
    }
    throw new Error(`Unhandled URL: ${url}`)
  }
  const client = createPerpsClient({
    integrator: 'market-settings-test',
    apiKey: 'test-key',
    retry: false,
    fetch: fetchImpl,
    providers: [lighterProvider({ restUrl: 'https://lighter.test' })],
  })
  const provider = client.getProvider('lighter')
  if (provider === undefined) {
    throw new Error('Lighter provider was not registered')
  }
  return provider
}

describe('Lighter getMarketSettings leverage read-back', () => {
  // Each IMF is the account-row percent string that a save of the leverage
  // stores: `round(10000 / leverage)` basis points.
  it.each([
    ['33.33', '3'],
    ['16.67', '6'],
    ['14.29', '7'],
    ['11.11', '9'],
  ])('reads IMF %s back as the saved %sx leverage', async (imf, leverage) => {
    await expect(
      setup(imf).getMarketSettings({
        address: ADDRESS,
        market: { marketId: MARKET_ID, categoryId: 'lighter' },
      })
    ).resolves.toEqual({ marginMode: MarginMode.CROSS, leverage })
  })
})
