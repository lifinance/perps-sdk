import {
  createPerpsClient,
  isLeverageEqual,
  safeIsLeverageEqual,
} from '@lifi/perps-sdk'
import { MarginMode, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
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
  return { client, provider }
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
      setup(imf).provider.getMarketSettings({
        address: ADDRESS,
        market: { marketId: MARKET_ID, categoryId: 'lighter' },
      })
    ).resolves.toEqual({ marginMode: MarginMode.CROSS, leverage })
  })

  it.each([
    ['15', '6.67', '14.99'],
    ['13', '7.69', '13'],
    ['17', '5.88', '17.01'],
    ['30', '3.33', '30.03'],
    ['32', '3.13', '31.95'],
    ['49', '2.04', '49.02'],
    ['14.5', '6.90', '14.49'],
    ['5', '20.00', '5'],
  ])('confirms %sx from IMF %s without changing the reported leverage', async (requested, imf, reported) => {
    const { client, provider } = setup(imf)
    const settings = await provider.getMarketSettings({
      address: ADDRESS,
      market: { marketId: MARKET_ID, categoryId: 'lighter' },
    })

    expect(settings.leverage).toBe(reported)
    expect(
      isLeverageEqual(client, 'lighter', requested, settings.leverage)
    ).toBe(true)
  })

  it.each([
    '6.66',
    '6.68',
    '10.00',
  ])('rejects a different stored IMF %s after a request for 15x', async (imf) => {
    const { client, provider } = setup(imf)
    const settings = await provider.getMarketSettings({
      address: ADDRESS,
      market: { marketId: MARKET_ID, categoryId: 'lighter' },
    })

    expect(isLeverageEqual(client, 'lighter', '15', settings.leverage)).toBe(
      false
    )
  })
})

describe('Lighter leverage comparison validation', () => {
  it.each([
    ['1.001', '1'],
    ['3.125', '3.13'],
    ['9.7752', '9.78'],
  ])('rejects the unsupported requested precision of %sx', (requested, reported) => {
    const { client, provider } = setup('6.67')
    const error = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
      message: expect.stringContaining('2 decimal places'),
    })
    expect(() =>
      isLeverageEqual(client, 'lighter', requested, reported)
    ).toThrow(error)
    expect(() => provider.isLeverageEqual(requested, reported)).toThrow(error)
  })

  it.each([
    ['20000.01', '15'],
    ['15', '20000.01'],
    ['1000000', '50000'],
  ])('rejects a zero IMF for %sx compared with %sx', (requested, reported) => {
    const { client, provider } = setup('6.67')
    const error = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
      message: expect.stringContaining('IMF'),
    })
    expect(() =>
      isLeverageEqual(client, 'lighter', requested, reported)
    ).toThrow(error)
    expect(() => provider.isLeverageEqual(requested, reported)).toThrow(error)
  })

  it('accepts trailing zeros within the requested precision', () => {
    const { client } = setup('6.67')
    expect(isLeverageEqual(client, 'lighter', '15.000', '14.99')).toBe(true)
  })

  it('rounds a half-basis-point IMF up to one rather than zero', () => {
    const { client } = setup('0.01')
    expect(isLeverageEqual(client, 'lighter', '20000', '10000')).toBe(true)
  })

  it('returns no safe comparison and warns for unsupported requested precision', () => {
    const { client } = setup('32.00')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        safeIsLeverageEqual(client, 'lighter', '3.125', '3.13')
      ).toBeUndefined()
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
