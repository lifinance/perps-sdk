import { DECIMAL_PATTERN, type DecimalString } from '@lifi/perps-types'
import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import { calculateOrderAmounts } from './orderAmounts.js'
import { snapOrderSize } from './snap.js'
import { venueMarket as market, venueClient } from './venueProvider.mock.js'

const sdk = venueClient()

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
    [3, `3.${'3'.repeat(40)}`],
    [4, '2.5'],
  ] as const)('divides a derived margin at %ix to 40 places half-up, with no trailing zeros', (leverage, margin) => {
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

  it('rounds a derived margin half-up at the 40th place', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 0 }),
      held: 'size',
      amount: '2',
      leverage: 3,
      price: '1',
    })

    expect(amounts?.margin).toBe(`0.${'6'.repeat(39)}7`)
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
  ])('gives null for a held %s of %s that snaps below one lot', (held, amount, price, szDecimals) => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market({ szDecimals }),
        held,
        amount,
        leverage: 1,
        price,
      })
    ).toBeNull()
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
  ])('gives null for the amount %j', (amount) => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount,
        leverage: 2,
        price: '0.07',
      })
    ).toBeNull()
  })

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '1e-8',
  ])('gives null for the price %j', (price) => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: '7',
        leverage: 2,
        price,
      })
    ).toBeNull()
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('gives null for the leverage %j', (leverage) => {
    expect(
      calculateOrderAmounts({
        sdk,
        market: market(),
        held: 'margin',
        amount: '7',
        leverage,
        price: '0.07',
      })
    ).toBeNull()
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

/** Half a unit in the 40th decimal place: the most a `DivBig` quotient moves. */
const HALF_ULP = new Big('5e-41')

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
    if (amounts === null) {
      expect.unreachable('every invariant row is a valid input')
    }

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
  )('a held size of %s at %ix on price %s (szDecimals %i) stays on the grid and prices its margin', (amount, leverage, price, szDecimals) => {
    const target = market({ szDecimals })
    const amounts = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'size',
      amount,
      leverage,
      price,
    })
    if (amounts === null) {
      expect.unreachable('every invariant row is a valid input')
    }

    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(
      new Big(amounts.notional).eq(new Big(amounts.size).times(price))
    ).toBe(true)
    const gap = new Big(amounts.margin)
      .times(leverage)
      .minus(amounts.notional)
      .abs()
    expect(gap.lte(HALF_ULP.times(leverage))).toBe(true)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })

  it.each(
    INVARIANT_ROWS
  )('a held notional of %s at %ix on price %s (szDecimals %i) caps the size and prices it exactly', (amount, leverage, price, szDecimals) => {
    const target = market({ szDecimals })
    const amounts = calculateOrderAmounts({
      sdk,
      market: target,
      held: 'notional',
      amount,
      leverage,
      price,
    })
    if (amounts === null) {
      expect.unreachable('every invariant row is a valid input')
    }

    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(
      new Big(amounts.notional).eq(new Big(amounts.size).times(price))
    ).toBe(true)
    expect(new Big(amounts.notional).lte(amount)).toBe(true)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })
})
