import {
  MarginMode,
  type MarketSettings,
  PerpsErrorCode,
  type Position,
} from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveExactLeverage,
  safeResolveExactLeverage,
  validateInitialMarginFractionBps,
} from './leverage.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('validateInitialMarginFractionBps', () => {
  it.each([
    '700',
    '667',
    '1',
    '10000',
    '700.0',
  ])('gives the positive integer %s unchanged', (value) => {
    expect(validateInitialMarginFractionBps(value)).toBe(value)
  })

  it.each([
    '0',
    '-700',
    '700.5',
    '6.67',
    '',
    'abc',
    '1e3',
  ])('throws ValidationError that names the IMF for %j', (value) => {
    expect(() => validateInitialMarginFractionBps(value)).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('initialMarginFractionBps'),
      })
    )
  })

  it('names the given parameter in the error', () => {
    expect(() =>
      validateInitialMarginFractionBps('0', 'reported initialMarginFractionBps')
    ).toThrow(
      "`reported initialMarginFractionBps` must be a positive integer, got '0'."
    )
  })
})

describe('resolveExactLeverage', () => {
  it.each([
    ['700', '14.2857142857142857142857142857142857142857'],
    ['667', '14.9925037481259370314842578710644677661169'],
    ['671', '14.9031296572280178837555886736214605067064'],
    ['1500', '6.6666666666666666666666666666666666666667'],
    ['1', '10000'],
    ['10000', '1'],
  ])('divides 10000 by the native IMF %s', (initialMarginFractionBps, expected) => {
    expect(
      resolveExactLeverage({ leverage: '14.3', initialMarginFractionBps })
    ).toBe(expected)
  })

  it('reads a Lighter MarketSettings from its IMF, not its rounded leverage', () => {
    const settings: MarketSettings = {
      marginMode: MarginMode.CROSS,
      leverage: '14.29',
      displayLeverage: '14.3',
      initialMarginFractionBps: '700',
    }
    expect(resolveExactLeverage(settings)).toBe(
      '14.2857142857142857142857142857142857142857'
    )
  })

  it('reads a Position from its IMF when the display leverage is absent', () => {
    const position: Pick<Position, 'leverage' | 'initialMarginFractionBps'> = {
      initialMarginFractionBps: '667',
    }
    expect(resolveExactLeverage(position)).toBe(
      '14.9925037481259370314842578710644677661169'
    )
  })

  it.each([
    '15',
    '14.29',
    '3.125',
    '1',
  ])('gives the leverage %s unchanged without a native IMF', (leverage) => {
    expect(resolveExactLeverage({ leverage })).toBe(leverage)
  })

  it.each([
    '0',
    '-700',
    '700.5',
    '6.67',
    '',
    'abc',
    '1e3',
  ])('throws ValidationError for the unusable IMF %j', (initialMarginFractionBps) => {
    expect(() =>
      resolveExactLeverage({ leverage: '15', initialMarginFractionBps })
    ).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('initialMarginFractionBps'),
      })
    )
  })

  it.each([
    undefined,
    '0',
    '-1',
    '',
    'abc',
    '1e1',
  ])('throws ValidationError for the unusable leverage %j without an IMF', (leverage) => {
    expect(() => resolveExactLeverage({ leverage })).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('safeResolveExactLeverage', () => {
  it('gives the result for a usable source', () => {
    expect(safeResolveExactLeverage({ initialMarginFractionBps: '1' })).toBe(
      '10000'
    )
  })

  it('gives undefined and warns for an unusable source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(safeResolveExactLeverage({})).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })
})
