import {
  DECIMAL_PATTERN,
  type DecimalString,
  PerpsErrorCode,
} from '@lifi/perps-types'
import Big from 'big.js'
import { describe, expect, it, vi } from 'vitest'
import {
  calculateOrderAmounts,
  safeCalculateOrderAmounts,
} from './orderAmounts.js'
import { snapOrderSize } from './snap.js'
import { venueMarket as market, venueClient } from './venueProvider.mock.js'

const sdk = venueClient()

/** One unit in the 40th decimal place: the most a derived margin rounds up. */
const ULP = new Big('1e-40')

describe('calculateOrderAmounts', () => {
  it('derives size and notional from a held margin', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'margin',
      amount: '7',
      leverage: 2,
      price: '0.07',
    })

    expect(amounts).toEqual({ margin: '7', size: '200', notional: '14' })
  })

  it('derives margin and notional from a held size', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'size',
      amount: '200',
      leverage: 2,
      price: '0.07',
    })

    expect(amounts).toEqual({ margin: '7', size: '200', notional: '14' })
  })

  it('gives a held size in the venue spelling, not the typed trailing zeros', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'size',
      amount: '200.00',
      leverage: 2,
      price: '0.07',
    })

    expect(amounts).toEqual({ margin: '7', size: '200', notional: '14' })
  })

  it('derives size and margin from a held notional', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'notional',
      amount: '14',
      leverage: 2,
      price: '0.07',
    })

    expect(amounts).toEqual({ margin: '7', size: '200', notional: '14' })
  })

  it('returns a held margin byte-identical, with no quote grid', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'margin',
      amount: '123.456789',
      leverage: 2,
      price: '0.07',
    })

    expect(amounts).toEqual({
      margin: '123.456789',
      size: '3527.33',
      notional: '246.9131',
    })
  })

  it.each([
    ['14.0001', '200', '14'],
    ['14.001', '200.01', '14.0007'],
  ] as const)('prices a held notional of %s from the snapped size %s, not the input', (amount, size, notional) => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'notional',
      amount,
      leverage: 2,
      price: '0.07',
    })

    expect(amounts?.size).toBe(size)
    expect(amounts?.notional).toBe(notional)
  })

  it('prices a held margin from the snapped size, not margin × leverage', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 5 }),
      held: 'margin',
      amount: '0.1',
      leverage: 1,
      price: '0.3',
    })

    expect(amounts).toEqual({
      margin: '0.1',
      size: '0.33333',
      notional: '0.099999',
    })
  })

  it('keeps an exact quotient exact', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 4 }),
      held: 'margin',
      amount: '100',
      leverage: 5,
      price: '1000',
    })

    expect(amounts).toEqual({ margin: '100', size: '0.5', notional: '500' })
  })

  it('keeps 17 significant digits of a held size, which a number drops', () => {
    expect(Number('1234567.0000000001')).toBe(1234567)

    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 10 }),
      held: 'size',
      amount: '1234567.0000000001',
      leverage: 1,
      price: '1',
    })

    expect(amounts?.size).toBe('1234567.0000000001')
  })

  it.each([
    [3, `3.${'3'.repeat(39)}4`],
    [4, '2.5'],
  ] as const)('rounds a derived margin at %ix up at the 40th place, with no trailing zeros', (leverage, margin) => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 6 }),
      held: 'size',
      amount: '1',
      leverage,
      price: '10',
    })

    expect(amounts).toEqual({ margin, size: '1', notional: '10' })
  })

  it('rounds a derived margin up at the 40th place where half-up rounds down', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 0 }),
      held: 'size',
      amount: '1',
      leverage: 3,
      price: '1',
    })

    expect(amounts?.margin).toBe(`0.${'3'.repeat(39)}4`)
  })

  it.each([
    ['size', '1', { leverage: 3 }, '1', 0],
    ['size', '2', { leverage: 6 }, '1', 0],
    ['size', '2', { leverage: 7 }, '1', 0],
    ['notional', '20', { leverage: 3 }, '10', 2],
    ['notional', '5', { leverage: 6 }, '0.7', 3],
    ['notional', '1', { leverage: 7 }, '0.3', 2],
    ['size', '3', { initialMarginFractionBps: '667' }, '17', 2],
    ['notional', '1000', { initialMarginFractionBps: '333' }, '3', 4],
  ] as const)('sizes the same order from a margin derived from a held %s of %s at %o on price %s (szDecimals %i)', (held, amount, rate, price, szDecimals) => {
    const target = market({ szDecimals })
    const derived = calculateOrderAmounts({
      sdk,
      market: target,
      held,
      amount,
      price,
      ...rate,
    })
    const reheld = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'margin',
      amount: derived.margin,
      price,
      ...rate,
    })

    expect(reheld).toEqual(derived)
    // The smallest 40-place value at or above the exact margin, so any
    // comparison value at or above the exact margin is at or above it too.
    const [numerator, denominator] =
      'leverage' in rate
        ? [1, rate.leverage]
        : [rate.initialMarginFractionBps, 10000]
    const exact = new Big(derived.notional).times(numerator)
    const margin = new Big(derived.margin)
    expect(margin.times(denominator).gte(exact)).toBe(true)
    expect(margin.minus(ULP).times(denominator).lt(exact)).toBe(true)
  })

  it('derives the margin of a held size at a non-integer leverage', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 6 }),
      held: 'size',
      amount: '1',
      leverage: 2.5,
      price: '10.999',
    })

    expect(amounts).toEqual({ margin: '4.3996', size: '1', notional: '10.999' })
  })

  it('derives the margin of a held notional from the snapped size', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 4 }),
      held: 'notional',
      amount: '10.999',
      leverage: 1.1,
      price: '3',
    })

    expect(amounts).toEqual({
      margin: '9.999',
      size: '3.6663',
      notional: '10.9989',
    })
  })

  it('snaps the size onto a non-power-of-ten lot grid', () => {
    const ondoLike = market({ szDecimals: 1, sizeIncrement: '0.5' })

    const amounts = calculateOrderAmounts({
      sdk,
      market: ondoLike,
      held: 'size',
      amount: '1.7',
      leverage: 2,
      price: '10',
    })

    expect(amounts?.size).toBe('1.5')
    expect(new Big(amounts?.size ?? '0').mod('0.5').eq(0)).toBe(true)
  })

  it('snaps a margin-derived size onto a non-power-of-ten lot grid', () => {
    const ondoLike = market({ szDecimals: 1, sizeIncrement: '0.5' })

    const amounts = calculateOrderAmounts({
      sdk,
      market: ondoLike,
      held: 'margin',
      amount: '17',
      leverage: 1,
      price: '10',
    })

    expect(amounts?.size).toBe('1.5')
    expect(new Big(amounts?.size ?? '0').mod('0.5').eq(0)).toBe(true)
  })

  it.each([
    ['margin' as const, '0.01' as DecimalString, '50000' as DecimalString, 5],
    ['margin' as const, '0.004' as DecimalString, '1' as DecimalString, 2],
    ['size' as const, '0.001' as DecimalString, '10' as DecimalString, 2],
    ['notional' as const, '0.01' as DecimalString, '50000' as DecimalString, 5],
  ])('throws a ValidationError with the lot size for a held %s of %s that snaps below one lot', (held, amount, price, szDecimals) => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market({ szDecimals }),
        held,
        amount,
        leverage: 1,
        price,
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining(
          `is below the lot size ${new Big(`1e-${szDecimals}`).toFixed()}.`
        ),
      })
    )
  })

  it('keeps a sub-cent margin when the lot grid takes the size', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'margin',
      amount: '0.004',
      leverage: 1,
      price: '0.001',
    })

    expect(amounts).toEqual({ margin: '0.004', size: '4', notional: '0.004' })
  })

  it('keeps a sub-cent notional and margin derived from a held size', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'size',
      amount: '0.01',
      leverage: 1,
      price: '0.001',
    })

    expect(amounts).toEqual({
      margin: '0.00001',
      size: '0.01',
      notional: '0.00001',
    })
  })

  it.each([
    '',
    '  ',
    'abc',
    '0',
    '-1',
    '1e5',
  ])('throws a ValidationError that names the amount %j', (amount) => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount,
        leverage: 2,
        price: '0.07',
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `\`amount\` must be a positive decimal, got '${amount}'.`,
      })
    )
  })

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '1e-8',
  ])('throws a ValidationError that names the price %j', (price) => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: '7',
        leverage: 2,
        price,
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `\`price\` must be a positive decimal, got '${price}'.`,
      })
    )
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('throws a ValidationError that names the leverage %j', (leverage) => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: '7',
        leverage,
        price: '0.07',
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `\`leverage\` must be a finite number above zero, got ${leverage}.`,
      })
    )
  })

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '6.67',
    '1e1',
  ])('throws a ValidationError that names the IMF %j', (initialMarginFractionBps) => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: '7',
        leverage: 2,
        initialMarginFractionBps,
        price: '0.07',
      })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: `\`initialMarginFractionBps\` must be a positive integer, got '${initialMarginFractionBps}'.`,
      })
    )
  })

  it('derives an exact margin of a held size from the native IMF', () => {
    // IMF 700 is 7.00%: 3000 × 700 ÷ 10000, with no leverage division.
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'size',
      amount: '3',
      initialMarginFractionBps: '700',
      price: '1000',
    })

    expect(amounts).toEqual({ margin: '210', size: '3', notional: '3000' })
  })

  it('derives an exact margin of a held notional from the native IMF', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'notional',
      amount: '1000',
      initialMarginFractionBps: '667',
      price: '100',
    })

    // 1000 × 667 ÷ 10000 = 66.7; the two-decimal 14.99x gives 66.7111….
    expect(amounts).toEqual({ margin: '66.7', size: '10', notional: '1000' })
  })

  it('sizes a held margin from the native IMF, not the rounded 14.29x', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 4 }),
      held: 'margin',
      amount: '70',
      initialMarginFractionBps: '700',
      price: '100',
    })

    // 70 × 10000 ÷ (100 × 700) = 10; 14.29x gives 10.003.
    expect(amounts).toEqual({ margin: '70', size: '10', notional: '1000' })
  })

  it('does not read the leverage when the native IMF is present', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 2 }),
      held: 'size',
      amount: '1',
      leverage: 0,
      initialMarginFractionBps: '1500',
      price: '100',
    })

    expect(amounts).toEqual({ margin: '15', size: '1', notional: '100' })
  })

  it('names the sizeIncrement as the lot size when the market carries one', () => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market({ sizeIncrement: '0.5' }),
        held: 'size',
        amount: '0.4',
        leverage: 1,
        price: '10',
      })
    ).toThrow('The order size 0.4 is below the lot size 0.5.')
  })

  it('throws an SDKError for a market whose provider is not registered', () => {
    expect(() =>
      calculateOrderAmounts({
        sdk,
        market: market({ providerId: 'unregistered' }),
        held: 'margin',
        amount: '7',
        leverage: 2,
        price: '0.07',
      })
    ).toThrow(expect.objectContaining({ code: PerpsErrorCode.SDKError }))
  })
})

describe('safeCalculateOrderAmounts', () => {
  it('gives undefined and warns on a bad amount', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      safeCalculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: 'abc',
        leverage: 2,
        price: '0.07',
      })
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

/** Non-terminating divisions in every column. */
const INVARIANT_ROWS: ReadonlyArray<
  readonly [DecimalString, number, DecimalString, number]
> = [
  ['100', 10, '3', 4],
  ['7', 3, '0.07', 2],
  ['1', 7, '3', 8],
  ['0.1', 1, '0.3', 5],
  ['1000', 3, '7', 6],
  ['12345.67', 11, '0.0001', 3],
  ['9', 13, '17', 5],
  ['100', 3, '7', 0],
  ['1000000', 50, '123.456', 4],
  ['33.33', 7, '0.17', 6],
  ['250.5', 2.5, '19.99', 3],
]

describe('calculateOrderAmounts invariants', () => {
  it.each(
    INVARIANT_ROWS
  )('margin %s at %ix on price %s (szDecimals %i) buys no more than it funds', (amount, leverage, price, szDecimals) => {
    const target = market({ szDecimals })
    const amounts = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'margin',
      amount,
      leverage,
      price,
    })
    expect(amounts.margin).toBe(amount)
    expect(
      new Big(amounts.size)
        .times(price)
        .lte(new Big(amounts.margin).times(leverage))
    ).toBe(true)
    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(
      new Big(amounts.notional).eq(new Big(amounts.size).times(price))
    ).toBe(true)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })

  it.each(
    INVARIANT_ROWS
  )('a held size of %s at %ix on price %s (szDecimals %i) stays on the grid, prices its margin and sizes the same order from it', (amount, leverage, price, szDecimals) => {
    const target = market({ szDecimals })
    const amounts = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'size',
      amount,
      leverage,
      price,
    })
    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(
      new Big(amounts.notional).eq(new Big(amounts.size).times(price))
    ).toBe(true)
    const margin = new Big(amounts.margin)
    expect(margin.times(leverage).gte(amounts.notional)).toBe(true)
    expect(margin.minus(ULP).times(leverage).lt(amounts.notional)).toBe(true)
    expect(
      calculateOrderAmounts({
        sdk,
        market: target,
        held: 'margin',
        amount: amounts.margin,
        leverage,
        price,
      })
    ).toEqual(amounts)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })

  it.each(
    INVARIANT_ROWS
  )('a held notional of %s at %ix on price %s (szDecimals %i) caps the size, prices it exactly and sizes the same order from its margin', (amount, leverage, price, szDecimals) => {
    const target = market({ szDecimals })
    const amounts = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'notional',
      amount,
      leverage,
      price,
    })
    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(
      new Big(amounts.notional).eq(new Big(amounts.size).times(price))
    ).toBe(true)
    expect(new Big(amounts.notional).lte(amount)).toBe(true)
    expect(
      calculateOrderAmounts({
        sdk,
        market: target,
        held: 'margin',
        amount: amounts.margin,
        leverage,
        price,
      })
    ).toEqual(amounts)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })
})
