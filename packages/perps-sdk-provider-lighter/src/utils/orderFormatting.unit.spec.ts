import {
  calculateOrderAmounts,
  calculateSlippageAdjustedLimitPrice,
  createPerpsClient,
  isDecimalString,
  PerpsError,
} from '@lifi/perps-sdk'
import {
  OrderSide,
  PerpsErrorCode,
  type PerpsMarket,
  PositionMarginAdjustment,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { lighterProvider, lighterRhProvider } from '../LighterProvider.js'
import {
  slippageAdjustedLimitPrice,
  snapOrderPrice,
  snapOrderSize,
} from './orderFormatting.js'

// Decimal budgets mirror live Lighter orderBookDetails:
// BTC: supported_price_decimals 1, supported_size_decimals 5
// DOGE: supported_price_decimals 6, supported_size_decimals 0
const market = (overrides: Partial<PerpsMarket>): PerpsMarket => ({
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
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
  szDecimals: 5,
  priceDecimals: 1,
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
  ...overrides,
})

const btc = market({})
const doge = market({
  id: '3',
  szDecimals: 0,
  priceDecimals: 6,
})

describe('snapOrderPrice (Lighter)', () => {
  it('rounds onto the market tick grid', () => {
    expect(snapOrderPrice(btc, '61729.64')).toBe('61729.6')
    expect(snapOrderPrice(btc, '61729.66')).toBe('61729.7')
  })

  it('keeps prices with more than 5 significant figures intact', () => {
    expect(snapOrderPrice(btc, '61729.6')).toBe('61729.6')
  })

  it('uses the full decimal budget on high-precision markets', () => {
    expect(snapOrderPrice(doge, '0.1234564')).toBe('0.123456')
    expect(snapOrderPrice(doge, '0.1234567')).toBe('0.123457')
  })

  it('removes trailing zeros', () => {
    expect(snapOrderPrice(doge, '0.1')).toBe('0.1')
    expect(snapOrderPrice(btc, '61730')).toBe('61730')
  })

  it('throws ValidationError when the market carries no priceDecimals', () => {
    const bare = market({ priceDecimals: undefined })
    try {
      snapOrderPrice(bare, '61729.6')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(PerpsError)
      expect((error as PerpsError).code).toBe(PerpsErrorCode.ValidationError)
    }
  })

  it('rounds exact-halfway decimals half-up on the true decimal value', () => {
    const twoDp = market({ priceDecimals: 2 })
    expect(snapOrderPrice(twoDp, '1.005')).toBe('1.01')
    expect(snapOrderPrice(twoDp, '-1.005')).toBe('-1.01')
  })

  it.each(['0', '-0'])('gives 0 for the price %j', (price) => {
    expect(snapOrderPrice(btc, price)).toBe('0')
  })

  it('emits plain notation for prices at or above 1e21', () => {
    expect(
      snapOrderPrice(market({ priceDecimals: 2 }), '1500000000000000000000')
    ).toBe('1500000000000000000000')
  })

  it.each([
    '61729.66',
    '0.1',
    '-1.005',
    '-0',
    '1500000000000000000000',
  ])('spells the snapped price of %j as a DecimalString', (price) => {
    expect(
      isDecimalString(snapOrderPrice(market({ priceDecimals: 2 }), price))
    ).toBe(true)
  })
})

describe('snapOrderSize (Lighter)', () => {
  it('truncates to the market lot grid (never rounds up)', () => {
    expect(snapOrderSize(btc, '0.000209')).toBe('0.0002')
    expect(snapOrderSize(doge, '12.9')).toBe('12')
  })

  it('removes trailing zeros', () => {
    expect(snapOrderSize(btc, '1.5')).toBe('1.5')
    expect(snapOrderSize(btc, '2')).toBe('2')
  })

  it('does not shave a lot off a float artifact spelled as a decimal', () => {
    expect(snapOrderSize(market({ szDecimals: 1 }), '8.2')).toBe('8.2')
    expect(
      snapOrderSize(market({ szDecimals: 2 }), '0.30000000000000004')
    ).toBe('0.3')
  })

  it('keeps the last lot step and separates it from the next one', () => {
    const sixDp = market({ szDecimals: 6 })
    expect(snapOrderSize(sixDp, '0.000599')).toBe('0.000599')
    expect(snapOrderSize(sixDp, '0.0006')).toBe('0.0006')
    expect(snapOrderSize(sixDp, '0.0005999')).toBe('0.000599')
  })

  it('keeps all 17 significant digits a number would drop', () => {
    expect(Number('1234567.0000000001')).toBe(1234567)
    expect(
      snapOrderSize(market({ szDecimals: 10 }), '1234567.0000000001')
    ).toBe('1234567.0000000001')
  })

  it.each(['0', '-0'])('gives 0 for the size %j', (size) => {
    expect(snapOrderSize(btc, size)).toBe('0')
  })

  it('truncates sub-lot dust to zero', () => {
    expect(snapOrderSize(btc, '0.00000002')).toBe('0')
  })

  it('emits plain notation for sizes at or above 1e21', () => {
    expect(
      snapOrderSize(market({ szDecimals: 2 }), '1500000000000000000000')
    ).toBe('1500000000000000000000')
  })

  it.each([
    '0.000209',
    '1.5',
    '-0',
    '0.00000002',
    '1500000000000000000000',
  ])('spells the snapped size of %j as a DecimalString', (size) => {
    expect(isDecimalString(snapOrderSize(btc, size))).toBe(true)
  })
})

describe('calculateOrderAmounts over the Lighter plugin', () => {
  const sdk = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [lighterProvider()],
  })

  it('returns a held margin byte-identical and truncates the size onto a whole-lot market', () => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: doge,
        held: 'margin',
        amount: '10.123456',
        leverage: 5,
        price: '0.123456',
      })
    ).toEqual({ margin: '10.123456', size: '410', notional: '50.61696' })
  })

  it('gives a held size in the Lighter spelling, with no trailing zeros', () => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: btc,
        held: 'size',
        amount: '0.00150',
        leverage: 10,
        price: '61729.6',
      })
    ).toEqual({ margin: '9.25944', size: '0.0015', notional: '92.5944' })
  })
})

describe('slippageAdjustedLimitPrice (Lighter)', () => {
  const eth = market({ id: '0', szDecimals: 4, priceDecimals: 2 })
  const params = (
    side: OrderSide,
    slippagePercent: string,
    triggerPrice = '2412.37'
  ) => ({ triggerPrice, side, slippagePercent })

  it('moves a sell trigger down by the percent and truncates onto the tick grid', () => {
    // 2412.37 × 0.97 = 2339.9989
    expect(slippageAdjustedLimitPrice(eth, params(OrderSide.SELL, '3'))).toBe(
      '2339.99'
    )
  })

  it('moves a buy trigger up by the percent and rounds up onto the tick grid', () => {
    // 2412.37 × 1.03 = 2484.7411
    expect(slippageAdjustedLimitPrice(eth, params(OrderSide.BUY, '3'))).toBe(
      '2484.75'
    )
  })

  it.each([
    // 2412.37 × 0.99 = 2388.2463, × 1.01 = 2436.4937
    ['1', '2388.24', '2436.5'],
    // 2412.37 × 0.9 = 2171.133, × 1.1 = 2653.607
    ['10', '2171.13', '2653.61'],
  ])('accepts the range bound %s%%', (percent, sell, buy) => {
    expect(
      slippageAdjustedLimitPrice(eth, params(OrderSide.SELL, percent))
    ).toBe(sell)
    expect(
      slippageAdjustedLimitPrice(eth, params(OrderSide.BUY, percent))
    ).toBe(buy)
  })

  it('keeps a result that is already on the tick grid', () => {
    expect(
      slippageAdjustedLimitPrice(eth, params(OrderSide.SELL, '2.5', '2000'))
    ).toBe('1950')
    expect(
      slippageAdjustedLimitPrice(eth, params(OrderSide.BUY, '2.5', '2000'))
    ).toBe('2050')
  })

  it.each([
    '0',
    '0.99',
    '10.01',
    '-3',
    '3%',
  ])('throws ValidationError for the slippagePercent %j', (percent) => {
    expect(() =>
      slippageAdjustedLimitPrice(eth, params(OrderSide.SELL, percent))
    ).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })

  it('throws ValidationError when the market carries no priceDecimals', () => {
    const bare = market({ priceDecimals: undefined })
    expect(() =>
      slippageAdjustedLimitPrice(bare, params(OrderSide.BUY, '3'))
    ).toThrowError(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('triggerOrders on the Lighter plugins', () => {
  it.each([
    ['lighter', lighterProvider],
    ['lighter-rh', lighterRhProvider],
  ])('sets the %s TP/SL settings', (_key, factory) => {
    expect(factory().triggerOrders).toEqual({
      modifyCanChangeType: false,
      marketSlippage: {
        min: '1',
        max: '10',
        step: '0.01',
        default: '1',
        slippageAdjustedLimitPrice,
      },
    })
  })

  it('gives the price through calculateSlippageAdjustedLimitPrice', () => {
    const sdk = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      providers: [lighterProvider()],
    })

    expect(
      calculateSlippageAdjustedLimitPrice(
        sdk,
        market({ id: '0', priceDecimals: 2 }),
        { triggerPrice: '2412.37', side: OrderSide.SELL, slippagePercent: '3' }
      )
    ).toBe('2339.99')
  })
})
