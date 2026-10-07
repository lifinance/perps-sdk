import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  LT_DEFAULT_ORDER_EXPIRY,
  LT_ORDER_TYPE_LIMIT,
  LT_ORDER_TYPE_MARKET,
  LT_ORDER_TYPE_STOP_LOSS,
  LT_ORDER_TYPE_STOP_LOSS_LIMIT,
  LT_ORDER_TYPE_TAKE_PROFIT,
  LT_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  LT_ORDER_TYPE_TWAP,
  LT_TIME_IN_FORCE_GTC,
  LT_TIME_IN_FORCE_IOC,
  LT_TIME_IN_FORCE_POST_ONLY,
} from '../types/action.js'
import {
  mapOrderTypeToInt,
  mapTimeInForceToInt,
  orderExpiryForTif,
  resolveTimeInForce,
} from './wireEncoding.js'

const expectValidationError = (fn: () => unknown, match: RegExp) => {
  expect(fn).toThrowError(match)
  try {
    fn()
    expect.unreachable('expected fn to throw')
  } catch (e) {
    if (!(e instanceof PerpsError)) {
      throw e
    }
    expect(e.code).toBe(PerpsErrorCode.ValidationError)
  }
}

describe('mapOrderTypeToInt', () => {
  it('maps each known order type to its wire integer', () => {
    expect(mapOrderTypeToInt('LIMIT')).toBe(LT_ORDER_TYPE_LIMIT)
    expect(mapOrderTypeToInt('MARKET')).toBe(LT_ORDER_TYPE_MARKET)
    expect(mapOrderTypeToInt('STOP_MARKET')).toBe(LT_ORDER_TYPE_STOP_LOSS)
    expect(mapOrderTypeToInt('STOP_LIMIT')).toBe(LT_ORDER_TYPE_STOP_LOSS_LIMIT)
    expect(mapOrderTypeToInt('TAKE_PROFIT_MARKET')).toBe(
      LT_ORDER_TYPE_TAKE_PROFIT
    )
    expect(mapOrderTypeToInt('TAKE_PROFIT_LIMIT')).toBe(
      LT_ORDER_TYPE_TAKE_PROFIT_LIMIT
    )
    expect(mapOrderTypeToInt('TWAP')).toBe(LT_ORDER_TYPE_TWAP)
  })

  it('defaults undefined and unknown types to LIMIT', () => {
    expect(mapOrderTypeToInt()).toBe(LT_ORDER_TYPE_LIMIT)
    expect(mapOrderTypeToInt('NONSENSE')).toBe(LT_ORDER_TYPE_LIMIT)
  })
})

describe('mapTimeInForceToInt', () => {
  it('maps each known TIF to its wire integer', () => {
    expect(mapTimeInForceToInt('IOC')).toBe(LT_TIME_IN_FORCE_IOC)
    expect(mapTimeInForceToInt('GTC')).toBe(LT_TIME_IN_FORCE_GTC)
    expect(mapTimeInForceToInt('POST_ONLY')).toBe(LT_TIME_IN_FORCE_POST_ONLY)
  })

  it('defaults undefined and unknown TIF to GTC', () => {
    expect(mapTimeInForceToInt()).toBe(LT_TIME_IN_FORCE_GTC)
    expect(mapTimeInForceToInt('???')).toBe(LT_TIME_IN_FORCE_GTC)
  })
})

describe('resolveTimeInForce', () => {
  it('forces IOC for market-style order types', () => {
    expect(resolveTimeInForce(LT_ORDER_TYPE_MARKET)).toBe(LT_TIME_IN_FORCE_IOC)
    expect(resolveTimeInForce(LT_ORDER_TYPE_STOP_LOSS)).toBe(
      LT_TIME_IN_FORCE_IOC
    )
    expect(resolveTimeInForce(LT_ORDER_TYPE_TAKE_PROFIT)).toBe(
      LT_TIME_IN_FORCE_IOC
    )
    expect(resolveTimeInForce(LT_ORDER_TYPE_MARKET, 'IOC')).toBe(
      LT_TIME_IN_FORCE_IOC
    )
  })

  it('rejects non-IOC TIF on market-style order types', () => {
    expectValidationError(
      () => resolveTimeInForce(LT_ORDER_TYPE_MARKET, 'GTC'),
      /only accept IOC/
    )
  })

  it('defaults limit-style order types to GTC and honors explicit TIF', () => {
    expect(resolveTimeInForce(LT_ORDER_TYPE_LIMIT)).toBe(LT_TIME_IN_FORCE_GTC)
    expect(resolveTimeInForce(LT_ORDER_TYPE_STOP_LOSS_LIMIT)).toBe(
      LT_TIME_IN_FORCE_GTC
    )
    expect(resolveTimeInForce(LT_ORDER_TYPE_LIMIT, 'POST_ONLY')).toBe(
      LT_TIME_IN_FORCE_POST_ONLY
    )
    expect(resolveTimeInForce(LT_ORDER_TYPE_LIMIT, 'IOC')).toBe(
      LT_TIME_IN_FORCE_IOC
    )
  })
})

describe('orderExpiryForTif', () => {
  it('returns nil expiry (0) for IOC', () => {
    expect(orderExpiryForTif(LT_TIME_IN_FORCE_IOC)).toBe(0)
  })

  it('returns the default-expiry sentinel for non-IOC TIFs', () => {
    expect(orderExpiryForTif(LT_TIME_IN_FORCE_GTC)).toBe(
      LT_DEFAULT_ORDER_EXPIRY
    )
    expect(orderExpiryForTif(LT_TIME_IN_FORCE_POST_ONLY)).toBe(
      LT_DEFAULT_ORDER_EXPIRY
    )
  })
})
