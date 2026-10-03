import { DECIMAL_PATTERN, PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { PerpsError } from '../errors/PerpsError.js'
import { snapOrderPrice, snapOrderSize } from './snap.js'
import {
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
