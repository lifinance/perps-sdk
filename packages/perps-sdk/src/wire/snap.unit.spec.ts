import { DECIMAL_PATTERN, OrderSide, PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import {
  calculateSlippageAdjustedLimitPrice,
  safeSnapOrderPrice,
  snapOrderPrice,
  snapOrderSize,
} from './snap.js'
import {
  VENUE_PROVIDER_ID,
  venueClient,
  venueMarket,
  venueProviderPlugin,
  venueSnapPrice,
  venueSnapSize,
} from './venueProvider.mock.js'

const MARKET = venueMarket({ szDecimals: 4, priceDecimals: 1 })

const spyingClient = () => {
  const size = vi.fn(venueSnapSize)
  const price = vi.fn(venueSnapPrice)
  const sdk = venueClient([
    venueProviderPlugin({ snapOrderSize: size, snapOrderPrice: price }),
  ])
  return { sdk, size, price }
}

describe('snapOrderSize', () => {
  it("delegates to the market's own provider", () => {
    const { sdk, size } = spyingClient()

    expect(snapOrderSize(sdk, MARKET, '0.12345')).toBe('0.1234')
    expect(size).toHaveBeenCalledWith(MARKET, '0.12345')
  })

  it('hands the provider the decimal string with no number hop', () => {
    const { sdk, size } = spyingClient()
    const market = venueMarket({ szDecimals: 10 })

    expect(snapOrderSize(sdk, market, '1234567.0000000001')).toBe(
      '1234567.0000000001'
    )
    expect(size).toHaveBeenCalledWith(market, '1234567.0000000001')
  })

  it('gives back a DecimalString', () => {
    const { sdk } = spyingClient()

    expect(snapOrderSize(sdk, MARKET, '0.129')).toMatch(DECIMAL_PATTERN)
    expect(snapOrderSize(sdk, MARKET, '-0')).toBe('0')
  })

  it('throws an SDKError when the market has no registered provider', () => {
    try {
      snapOrderSize(venueClient([]), MARKET, '1')
      expect.unreachable('expected a missing-provider throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      expect((error as PerpsError).code).toBe(PerpsErrorCode.SDKError)
    }
  })
})

describe('snapOrderPrice', () => {
  it("delegates to the market's own provider", () => {
    const { sdk, price } = spyingClient()

    expect(snapOrderPrice(sdk, MARKET, '61729.66')).toBe('61729.7')
    expect(price).toHaveBeenCalledWith(MARKET, '61729.66')
  })

  it('gives back a DecimalString', () => {
    const { sdk } = spyingClient()

    expect(snapOrderPrice(sdk, MARKET, '61729.66')).toMatch(DECIMAL_PATTERN)
    expect(snapOrderPrice(sdk, MARKET, '-0')).toBe('0')
  })

  it('throws an SDKError when the market has no registered provider', () => {
    try {
      snapOrderPrice(venueClient([]), MARKET, '1')
      expect.unreachable('expected a missing-provider throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      expect((error as PerpsError).code).toBe(PerpsErrorCode.SDKError)
    }
  })
})

describe('safeSnapOrderPrice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gives the same result as snapOrderPrice', () => {
    const { sdk } = spyingClient()

    expect(safeSnapOrderPrice(sdk, MARKET, '61729.66')).toBe(
      snapOrderPrice(sdk, MARKET, '61729.66')
    )
  })

  it('gives undefined and writes one warning per market when the snap throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sdk = venueClient([
      venueProviderPlugin({
        snapOrderPrice: () => {
          throw new PerpsError(PerpsErrorCode.ValidationError, 'no tick')
        },
      }),
    ])
    const btc = venueMarket({ id: 'SAFE-SNAP-BTC' })
    const eth = venueMarket({ id: 'SAFE-SNAP-ETH' })

    expect(safeSnapOrderPrice(sdk, btc, '1.23')).toBeUndefined()
    expect(safeSnapOrderPrice(sdk, btc, '4.56')).toBeUndefined()
    expect(safeSnapOrderPrice(sdk, eth, '1.23')).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toBe(
      `[perps-sdk] snapOrderPrice failed on market 'SAFE-SNAP-BTC' (${VENUE_PROVIDER_ID}): no tick`
    )
  })

  it('gives undefined when the market has no registered provider', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      safeSnapOrderPrice(
        venueClient([]),
        venueMarket({ id: 'SAFE-SNAP-NO-PROVIDER' }),
        '1'
      )
    ).toBeUndefined()
  })
})

describe('calculateSlippageAdjustedLimitPrice', () => {
  const PARAMS = {
    triggerPrice: '2412.37',
    side: OrderSide.SELL,
    slippagePercent: '3',
  }

  it("delegates to the market's own provider", () => {
    const slippageAdjustedLimitPrice = vi.fn(() => '2339.99')
    const sdk = venueClient([
      {
        ...venueProviderPlugin(),
        triggerOrders: {
          modifyCanChangeType: false,
          marketSlippage: {
            min: '1',
            max: '10',
            step: '0.01',
            default: '1',
            slippageAdjustedLimitPrice,
          },
        },
      },
    ])

    expect(calculateSlippageAdjustedLimitPrice(sdk, MARKET, PARAMS)).toBe(
      '2339.99'
    )
    expect(slippageAdjustedLimitPrice).toHaveBeenCalledWith(MARKET, PARAMS)
  })

  it.each([
    ['no triggerOrders', undefined],
    ['no marketSlippage', { modifyCanChangeType: true }],
  ])('throws a ValidationError when the provider has %s', (_case, triggerOrders) => {
    const sdk = venueClient([{ ...venueProviderPlugin(), triggerOrders }])

    expect(() =>
      calculateSlippageAdjustedLimitPrice(sdk, MARKET, PARAMS)
    ).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('throws an SDKError when the market has no registered provider', () => {
    expect(() =>
      calculateSlippageAdjustedLimitPrice(venueClient([]), MARKET, PARAMS)
    ).toThrowError(expect.objectContaining({ code: PerpsErrorCode.SDKError }))
  })
})

describe('venueSnapSize', () => {
  it('truncates a size just below a lot past 20 decimal places', () => {
    expect(venueSnapSize(venueMarket(), '0.0099999999999999999999999')).toBe(
      '0'
    )
    expect(
      venueSnapSize(
        venueMarket({ sizeIncrement: '0.5' }),
        '0.99999999999999999999995'
      )
    ).toBe('0.5')
  })
})
