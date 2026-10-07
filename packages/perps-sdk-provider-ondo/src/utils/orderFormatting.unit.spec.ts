import {
  calculateOrderAmounts,
  createPerpsClient,
  isDecimalString,
  PerpsError,
  snapOrderPrice as snapOrderPriceViaSdk,
} from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type PerpsMarket,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { ondoProvider } from '../OndoProvider.js'
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

  it('rounds down a price just below the half tick past 20 decimal places', () => {
    expect(snapOrderPrice(marketFixture(), '0.0049999999999999999999999')).toBe(
      '0'
    )
    expect(
      snapOrderPrice(
        marketFixture({ priceIncrement: '0.5' }),
        '0.24999999999999999999995'
      )
    ).toBe('0')
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

  it('truncates a 40-decimal quotient onto the lot grid', () => {
    expect(
      snapOrderSize(
        marketFixture(),
        '42.8571428571428571428571428571428571428571'
      )
    ).toBe('42.85')
  })

  it('truncates a size just below a lot past 20 decimal places', () => {
    expect(snapOrderSize(marketFixture(), '0.0099999999999999999999999')).toBe(
      '0'
    )
    expect(
      snapOrderSize(
        marketFixture({ sizeIncrement: '0.5' }),
        '0.99999999999999999999995'
      )
    ).toBe('0.5')
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

describe('calculateOrderAmounts over the Ondo plugin', () => {
  const sdk = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [ondoProvider()],
  })

  it('truncates the 40-decimal quotient it derives onto the lot grid', () => {
    const market = marketFixture({ szDecimals: 2 })

    const amounts = calculateOrderAmounts({
      sdk,
      market,
      held: 'margin',
      amount: '100',
      leverage: 3,
      price: '7',
    })

    expect(amounts).toEqual({
      margin: '100',
      size: '42.85',
      notional: '299.95',
    })
    expect(snapOrderSize(market, amounts?.size ?? '0')).toBe('42.85')
  })

  it('prices the size the 0.5 lot grid rounds down to, with no quote grid', () => {
    const market = marketFixture({ sizeIncrement: '0.5' })

    const amounts = calculateOrderAmounts({
      sdk,
      market,
      held: 'size',
      amount: '1.7',
      leverage: 3,
      price: '10.999',
    })

    expect(amounts).toEqual({
      margin: '5.4995',
      size: '1.5',
      notional: '16.4985',
    })
  })

  it('throws for an amount below one Ondo lot', () => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: marketFixture({ sizeIncrement: '0.5' }),
        held: 'size',
        amount: '0.4',
        leverage: 1,
        price: '10',
      })
    ).toThrowError('The order size 0.4 is below the lot size 0.5.')
  })

  it('propagates the missing price grid through the client wrapper', () => {
    const market = marketFixture({
      priceDecimals: undefined,
      priceIncrement: undefined,
    })

    expect(() => snapOrderPriceViaSdk(sdk, market, '201.5')).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})
