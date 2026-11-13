import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { annualizeFundingRate, safeAnnualizeFundingRate } from './funding.js'

const HOUR_SECONDS = 60 * 60

describe('annualizeFundingRate', () => {
  it('multiplies an hourly rate by 8760 hours', () => {
    expect(annualizeFundingRate('0.0000125', HOUR_SECONDS)).toBe('0.1095')
  })

  it('keeps the sign of a negative rate', () => {
    expect(annualizeFundingRate('-0.00001', HOUR_SECONDS)).toBe('-0.0876')
  })

  it('gives zero for a zero rate', () => {
    expect(annualizeFundingRate('0', HOUR_SECONDS)).toBe('0')
  })

  it('scales by the rate period when it is not one hour', () => {
    expect(annualizeFundingRate('0.0001', 8 * HOUR_SECONDS)).toBe('0.1095')
  })

  it('keeps full precision where the year does not divide by the period', () => {
    expect(annualizeFundingRate('0.0007', 7 * 24 * HOUR_SECONDS)).toBe('0.0365')
    expect(annualizeFundingRate('1', 7)).toBe(
      '4505142.8571428571428571428571428571428571428571'
    )
  })

  it('does not round a rate beyond the precision of a number', () => {
    expect(annualizeFundingRate('0.0000123456789012345678', HOUR_SECONDS)).toBe(
      '0.108148147174814813928'
    )
  })

  it.each([
    0,
    -HOUR_SECONDS,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('throws a ValidationError that names ratePeriodSeconds for %s', (period) => {
    expect(() => annualizeFundingRate('0.0001', period)).toThrow(
      expect.objectContaining({
        code: PerpsErrorCode.ValidationError,
        message: expect.stringContaining('ratePeriodSeconds'),
      })
    )
  })

  it('throws a ValidationError for a rate that does not match the decimal pattern', () => {
    expect(() => annualizeFundingRate('0.01%', HOUR_SECONDS)).toThrow(
      expect.objectContaining({ code: PerpsErrorCode.ValidationError })
    )
  })
})

describe('safeAnnualizeFundingRate', () => {
  it('gives the same value as annualizeFundingRate', () => {
    expect(safeAnnualizeFundingRate('-0.00001', HOUR_SECONDS)).toBe('-0.0876')
  })

  it('gives undefined and warns in place of a throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(safeAnnualizeFundingRate('1e-5', HOUR_SECONDS)).toBeUndefined()
    expect(safeAnnualizeFundingRate('0.0001', 0)).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
})
