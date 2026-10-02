import { PerpsError } from '@lifi/perps-sdk'
import {
  isDecimalString,
  PerpsErrorCode,
  type PerpsMarket,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { snapOrderPrice, snapOrderSize } from './orderFormatting.js'

const marketFixture = (overrides?: Partial<PerpsMarket>): PerpsMarket => ({
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
  szDecimals: 2,
  priceDecimals: 2,
  maxLeverage: 10,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.NONE,
  ...overrides,
})

describe('snapOrderPrice', () => {
  it('rounds half-up onto a power-of-ten priceDecimals grid', () => {
    const market = marketFixture()
    expect(snapOrderPrice(market, '201.555')).toBe('201.56')
    expect(snapOrderPrice(market, '201.554')).toBe('201.55')
  })

  it('snaps half-up onto a non-power-of-ten priceIncrement grid', () => {
    const market = marketFixture({ priceIncrement: '0.25' })
    expect(snapOrderPrice(market, '100.13')).toBe('100.25')
    expect(snapOrderPrice(market, '100.12')).toBe('100')
    expect(snapOrderPrice(market, '100.375')).toBe('100.5')
  })

  it('snaps half-up onto a 0.05 priceIncrement grid', () => {
    const market = marketFixture({ priceIncrement: '0.05' })
    expect(snapOrderPrice(market, '100.37')).toBe('100.35')
    expect(snapOrderPrice(market, '100.38')).toBe('100.4')
  })

  it('prefers priceIncrement over priceDecimals when both are present', () => {
    const market = marketFixture({ priceDecimals: 4, priceIncrement: '0.25' })
    expect(snapOrderPrice(market, '100.13')).toBe('100.25')
  })

  it('strips trailing zeros', () => {
    expect(snapOrderPrice(marketFixture(), '201.5')).toBe('201.5')
    expect(snapOrderPrice(marketFixture(), '200')).toBe('200')
  })

  it.each(['0', '-0'])('formats the price %j as "0"', (price) => {
    expect(snapOrderPrice(marketFixture(), price)).toBe('0')
  })

  it('throws ValidationError when the market carries no price grid', () => {
    const market = marketFixture({
      priceDecimals: undefined,
      priceIncrement: undefined,
    })
    expect(() => snapOrderPrice(market, '201.5')).toThrowError(PerpsError)
    expect(() => snapOrderPrice(market, '201.5')).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it.each([
    '201.555',
    '200',
    '-0',
    '100.375',
  ])('spells the snapped price of %j as a DecimalString', (price) => {
    expect(isDecimalString(snapOrderPrice(marketFixture(), price))).toBe(true)
  })
})

describe('snapOrderSize', () => {
  it('truncates toward zero onto a power-of-ten szDecimals grid', () => {
    const market = marketFixture()
    // Never rounds up: the size must not exceed the user's balance.
    expect(snapOrderSize(market, '0.129')).toBe('0.12')
    expect(snapOrderSize(market, '1.999')).toBe('1.99')
  })

  it('truncates toward zero onto a non-power-of-ten sizeIncrement grid', () => {
    const market = marketFixture({ sizeIncrement: '0.25' })
    expect(snapOrderSize(market, '1.6')).toBe('1.5')
    expect(snapOrderSize(market, '0.74')).toBe('0.5')
  })

  it('truncates toward zero onto a 0.5 sizeIncrement grid', () => {
    const market = marketFixture({ sizeIncrement: '0.5' })
    expect(snapOrderSize(market, '1.7')).toBe('1.5')
  })

  it('truncates toward zero onto a 0.05 sizeIncrement grid', () => {
    const market = marketFixture({ sizeIncrement: '0.05' })
    expect(snapOrderSize(market, '1.37')).toBe('1.35')
  })

  it('keeps the last lot step and separates it from the next one', () => {
    const sixDp = marketFixture({ szDecimals: 6 })
    expect(snapOrderSize(sixDp, '0.000599')).toBe('0.000599')
    expect(snapOrderSize(sixDp, '0.0006')).toBe('0.0006')
    expect(snapOrderSize(sixDp, '0.0005999')).toBe('0.000599')
  })

  it('keeps all 17 significant digits a number would drop', () => {
    expect(Number('1234567.0000000001')).toBe(1234567)
    expect(
      snapOrderSize(marketFixture({ szDecimals: 10 }), '1234567.0000000001')
    ).toBe('1234567.0000000001')
  })

  it('strips trailing zeros', () => {
    expect(snapOrderSize(marketFixture(), '1.5')).toBe('1.5')
    expect(snapOrderSize(marketFixture(), '3')).toBe('3')
  })

  it.each(['0.001', '0', '-0'])('formats the size %j as "0"', (size) => {
    expect(snapOrderSize(marketFixture(), size)).toBe('0')
  })

  it.each([
    '0.129',
    '1.5',
    '-0',
    '0.001',
  ])('spells the snapped size of %j as a DecimalString', (size) => {
    expect(isDecimalString(snapOrderSize(marketFixture(), size))).toBe(true)
  })
})
