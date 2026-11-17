import { createPerpsClient } from '@lifi/perps-sdk'
import { MarginMode, PerpsErrorCode } from '@lifi/perps-types'
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
    ).resolves.toMatchObject({ marginMode: MarginMode.CROSS, leverage })
  })

  it.each([
    ['15', '6.67', '14.99', '15', '667'],
    ['13', '7.69', '13', '13', '769'],
    ['17', '5.88', '17.01', '17', '588'],
    ['30', '3.33', '30.03', '30', '333'],
    ['32', '3.13', '31.95', '31.9', '313'],
    ['49', '2.04', '49.02', '49', '204'],
    ['14.5', '6.90', '14.49', '14.5', '690'],
    ['5', '20.00', '5', '5', '2000'],
  ])('confirms %sx from IMF %s while preserving order and display values', async (requested, imf, leverage, displayLeverage, leverageSource) => {
    const { provider } = setup(imf)
    const settings = await provider.getMarketSettings({
      address: ADDRESS,
      market: { marketId: MARKET_ID, categoryId: 'lighter' },
    })

    expect(settings).toEqual({
      marginMode: MarginMode.CROSS,
      leverage,
      displayLeverage,
      leverageSource,
    })
    expect(provider.isLeverageEqual(requested, settings)).toBe(true)
  })

  it.each([
    '6.66',
    '6.68',
    '10.00',
  ])('rejects a different stored IMF %s after a request for 15x', async (imf) => {
    const { provider } = setup(imf)
    const settings = await provider.getMarketSettings({
      address: ADDRESS,
      market: { marketId: MARKET_ID, categoryId: 'lighter' },
    })

    expect(provider.isLeverageEqual('15', settings)).toBe(false)
  })

  it('rejects a native IMF mismatch hidden by the rounded leverage', async () => {
    const { provider } = setup('98.50')
    const settings = await provider.getMarketSettings({
      address: ADDRESS,
      market: { marketId: MARKET_ID, categoryId: 'lighter' },
    })

    expect(settings).toMatchObject({
      leverage: '1.02',
      displayLeverage: '1',
      leverageSource: '9850',
    })
    expect(provider.isLeverageEqual('1.02', settings)).toBe(false)
  })
})

describe('Lighter leverage comparison validation', () => {
  it.each([
    ['1.001', '1'],
    ['3.125', '3.13'],
    ['9.7752', '9.78'],
  ])('rejects the unsupported requested precision of %sx', (requested, reported) => {
    const { provider } = setup('6.67')
    const error = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
      message: expect.stringContaining('2 decimal places'),
    })
    expect(() =>
      provider.isLeverageEqual(requested, {
        marginMode: MarginMode.CROSS,
        leverage: reported,
        leverageSource: '667',
      })
    ).toThrow(error)
  })

  it.each([
    ['20000.01', '15', '667'],
    ['15', '20000.01', '0'],
    ['1000000', '50000', '0'],
  ])('rejects a zero IMF for %sx compared with %sx', (requested, reported, leverageSource) => {
    const { provider } = setup('6.67')
    const error = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
      message: expect.stringContaining('IMF'),
    })
    expect(() =>
      provider.isLeverageEqual(requested, {
        marginMode: MarginMode.CROSS,
        leverage: reported,
        leverageSource,
      })
    ).toThrow(error)
  })

  it('accepts trailing zeros within the requested precision', () => {
    const { provider } = setup('6.67')
    expect(
      provider.isLeverageEqual('15.000', {
        marginMode: MarginMode.CROSS,
        leverage: '14.99',
        leverageSource: '667',
      })
    ).toBe(true)
  })

  it('rounds a half-basis-point IMF up to one rather than zero', () => {
    const { provider } = setup('0.01')
    expect(
      provider.isLeverageEqual('20000', {
        marginMode: MarginMode.CROSS,
        leverage: '10000',
        leverageSource: '1',
      })
    ).toBe(true)
  })

  it('rejects confirmation without a native source instead of trusting display leverage', () => {
    const { provider } = setup('6.67')
    expect(() =>
      provider.isLeverageEqual('15', {
        marginMode: MarginMode.CROSS,
        leverage: '15',
        displayLeverage: '15',
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
      })
    )
  })

  it.each([
    '0',
    '-1',
    '',
    'NaN',
    '1e1',
  ])('rejects invalid leverage %j on either side', (value) => {
    const { provider } = setup('6.67')
    const error = expect.objectContaining({
      code: PerpsErrorCode.ValidationError,
    })
    expect(() =>
      provider.isLeverageEqual(value, {
        marginMode: MarginMode.CROSS,
        leverage: '14.99',
        leverageSource: '667',
      })
    ).toThrow(error)
    expect(() =>
      provider.isLeverageEqual('15', {
        marginMode: MarginMode.CROSS,
        leverage: value,
        leverageSource: '667',
      })
    ).toThrow(error)
  })

  it.each([
    '-1',
    '6.67',
    'invalid',
  ])('rejects an unusable native IMF %j', (leverageSource) => {
    const { provider } = setup('6.67')
    expect(() =>
      provider.isLeverageEqual('15', {
        marginMode: MarginMode.CROSS,
        leverage: '14.99',
        leverageSource,
      })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.ValidationError }))
  })
})
