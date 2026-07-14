import { describe, expect, it } from 'vitest'
import { ActionType, PerpsErrorCode, SigningMethod } from './enums.js'

describe('PerpsErrorCode.Unauthorized', () => {
  it('carries the auth-range value 2013', () => {
    expect(PerpsErrorCode.Unauthorized).toBe(2013)
  })

  it('is distinct from the other 401-mapped auth codes', () => {
    expect(PerpsErrorCode.Unauthorized).not.toBe(
      PerpsErrorCode.SignatureInvalid
    )
    expect(PerpsErrorCode.Unauthorized).not.toBe(
      PerpsErrorCode.TermsNotAccepted
    )
    expect(PerpsErrorCode.Unauthorized).not.toBe(
      PerpsErrorCode.AgentUnauthorized
    )
  })

  it('does not collide with any existing PerpsErrorCode value', () => {
    const values = Object.values(PerpsErrorCode).filter(
      (v): v is number => typeof v === 'number'
    )
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('SigningMethod credential members', () => {
  it('API_KEY carries wire value "apiKey"', () => {
    expect(SigningMethod.API_KEY).toBe('apiKey')
  })

  it('SIWE carries wire value "siwe"', () => {
    expect(SigningMethod.SIWE).toBe('siwe')
  })

  it('does not collide with any existing SigningMethod value', () => {
    const values = Object.values(SigningMethod)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('ActionType.SIWE_LOGIN', () => {
  it('carries wire value "siweLogin"', () => {
    expect(ActionType.SIWE_LOGIN).toBe('siweLogin')
  })

  it('does not collide with any existing ActionType value', () => {
    const values = Object.values(ActionType)
    expect(new Set(values).size).toBe(values.length)
  })
})
