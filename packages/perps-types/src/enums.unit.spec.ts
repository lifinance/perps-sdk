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
  it('HMAC carries wire value "hmac"', () => {
    expect(SigningMethod.HMAC).toBe('hmac')
  })

  it('SIWE carries wire value "siwe"', () => {
    expect(SigningMethod.SIWE).toBe('siwe')
  })

  it('SESSION carries wire value "session"', () => {
    expect(SigningMethod.SESSION).toBe('session')
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

  it('ACCEPT_PROVIDER_TERMS carries wire value "acceptProviderTerms", distinct from META_ACCEPT_TERMS', () => {
    expect(ActionType.ACCEPT_PROVIDER_TERMS).toBe('acceptProviderTerms')
    expect(ActionType.ACCEPT_PROVIDER_TERMS).not.toBe(
      ActionType.META_ACCEPT_TERMS
    )
  })

  it('does not collide with any existing ActionType value', () => {
    const values = Object.values(ActionType)
    expect(new Set(values).size).toBe(values.length)
  })
})
