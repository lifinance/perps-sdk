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

  it('truncates a non-terminating quotient onto the lot grid', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 5 }),
      held: 'margin',
      amount: '0.1',
      leverage: 1,
      price: '0.3',
    })

    expect(amounts?.size).toBe('0.33333')
    expect(amounts?.margin).toBe('0.1')
    expect(amounts?.notional).toBe('0.1')
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

  it('truncates the quote amounts to quoteDecimals, 2 by default', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 6 }),
      held: 'size',
      amount: '1',
      leverage: 3,
      price: '10.999',
    })

    expect(amounts).toEqual({
      margin: '3.66',
      size: '1',
      notional: '10.99',
    })
  })

  it('honours a wider quoteDecimals', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 6 }),
      held: 'size',
      amount: '1',
      leverage: 3,
      price: '10.999',
      quoteDecimals: 4,
    })

    expect(amounts).toEqual({
      margin: '3.6663',
      size: '1',
      notional: '10.999',
    })
  })

  it('truncates a held margin that carries more than quoteDecimals digits', () => {
    const amounts = calculateOrderAmounts({
      sdk,
      market: market({ szDecimals: 4 }),
      held: 'margin',
      amount: '7.999',
      leverage: 1,
      price: '1',
    })

    expect(amounts?.margin).toBe('7.99')
    expect(amounts?.size).toBe('7.99')
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

  it.each(['', 'abc', '0', '-1'])('gives null for the price %j', (price) => {
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

/**
 * Non-terminating divisions in every column. A held margin is the direction
 * that can overspend, so the ceiling is the one the table pins.
 */
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
  ['0.5', 2, '3', 0],
  ['1000000', 50, '123.456', 4],
  ['33.33', 7, '0.17', 6],
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
    if (amounts === null) {
      expect.unreachable('every invariant row is a valid input')
    }

    expect(
      new Big(amounts.size)
        .times(price)
        .lte(new Big(amounts.margin).times(leverage))
    ).toBe(true)
    expect(snapOrderSize(sdk, target, amounts.size)).toBe(amounts.size)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })

  it.each(
    INVARIANT_ROWS
  )('a held size of %s at %ix on price %s (szDecimals %i) stays on the grid and under-funds nothing', (amount, leverage, price, szDecimals) => {
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
    // A held size fixes the notional, so the margin truncates downward.
    expect(
      new Big(amounts.margin)
        .times(leverage)
        .lte(new Big(amounts.size).times(price))
    ).toBe(true)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })

  it.each(
    INVARIANT_ROWS
  )('a held notional of %s at %ix on price %s (szDecimals %i) caps both derived sides', (amount, leverage, price, szDecimals) => {
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
      new Big(amounts.size).times(price).lte(new Big(amounts.notional))
    ).toBe(true)
    expect(
      new Big(amounts.margin).times(leverage).lte(new Big(amounts.notional))
    ).toBe(true)
    expect(amounts.margin).toMatch(DECIMAL_PATTERN)
    expect(amounts.size).toMatch(DECIMAL_PATTERN)
    expect(amounts.notional).toMatch(DECIMAL_PATTERN)
  })
})
