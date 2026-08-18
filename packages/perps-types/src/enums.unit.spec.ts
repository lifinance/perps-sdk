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

describe('PerpsErrorCode.SetupRequired', () => {
  it('carries the setup-range value 2070', () => {
    expect(PerpsErrorCode.SetupRequired).toBe(2070)
  })

  it('is distinct from the codes a client could otherwise conflate it with', () => {
    expect(PerpsErrorCode.SetupRequired).not.toBe(
      PerpsErrorCode.AccountNotFound
    )
    expect(PerpsErrorCode.SetupRequired).not.toBe(
      PerpsErrorCode.TermsNotAccepted
    )
    expect(PerpsErrorCode.SetupRequired).not.toBe(
      PerpsErrorCode.ValidationError
    )
  })

  it('is the only member in the documented 2070-2079 setup range', () => {
    const inRange = Object.entries(PerpsErrorCode).filter(
      ([, value]) => typeof value === 'number' && value >= 2070 && value <= 2079
    )

    expect(inRange).toEqual([['SetupRequired', 2070]])
  })
})

describe('PerpsErrorCode.FeatureUnavailable', () => {
  it('carries the capability-range value 2080', () => {
    expect(PerpsErrorCode.FeatureUnavailable).toBe(2080)
  })

  it('is distinct from the codes a client could otherwise conflate it with', () => {
    expect(PerpsErrorCode.FeatureUnavailable).not.toBe(
      PerpsErrorCode.ExchangeRejected
    )
    expect(PerpsErrorCode.FeatureUnavailable).not.toBe(
      PerpsErrorCode.SetupRequired
    )
    expect(PerpsErrorCode.FeatureUnavailable).not.toBe(
      PerpsErrorCode.MarketNotFound
    )
  })

  it('is the only member in the documented 2080-2089 capability range', () => {
    const inRange = Object.entries(PerpsErrorCode).filter(
      ([, value]) => typeof value === 'number' && value >= 2080 && value <= 2089
    )

    expect(inRange).toEqual([['FeatureUnavailable', 2080]])
  })
})

describe('PerpsErrorCode.RateLimitExceeded', () => {
  it('carries the rate-limit-range value 2090', () => {
    expect(PerpsErrorCode.RateLimitExceeded).toBe(2090)
  })

  it('does not collide with an existing PerpsErrorCode value', () => {
    const namesOnValue = Object.entries(PerpsErrorCode)
      .filter(([, value]) => value === PerpsErrorCode.RateLimitExceeded)
      .map(([name]) => name)

    expect(namesOnValue).toEqual(['RateLimitExceeded'])
  })

  it('is distinct from the codes a client could otherwise conflate it with', () => {
    expect(PerpsErrorCode.RateLimitExceeded).not.toBe(
      PerpsErrorCode.ServerError
    )
    expect(PerpsErrorCode.RateLimitExceeded).not.toBe(
      PerpsErrorCode.TimeoutError
    )
    expect(PerpsErrorCode.RateLimitExceeded).not.toBe(
      PerpsErrorCode.ThirdPartyError
    )
    expect(PerpsErrorCode.RateLimitExceeded).not.toBe(
      PerpsErrorCode.FeatureUnavailable
    )
    expect(PerpsErrorCode.RateLimitExceeded).not.toBe(
      PerpsErrorCode.SetupRequired
    )
  })

  it('is the only member in the documented 2090-2099 rate-limit range', () => {
    const inRange = Object.entries(PerpsErrorCode).filter(
      ([, value]) => typeof value === 'number' && value >= 2090 && value <= 2099
    )

    expect(inRange).toEqual([['RateLimitExceeded', 2090]])
  })
})

describe('PerpsErrorCode wire compatibility', () => {
  it('keeps every previously published code on its published value', () => {
    const published = {
      DefaultError: 2000,
      ServerError: 2001,
      ValidationError: 2002,
      TimeoutError: 2003,
      ThirdPartyError: 2004,
      SDKError: 2005,
      SignatureInvalid: 2010,
      AgentUnauthorized: 2011,
      TermsNotAccepted: 2012,
      Unauthorized: 2013,
      ExchangeRejected: 2020,
      InsufficientMargin: 2021,
      InsufficientBalance: 2022,
      MarketNotFound: 2023,
      OrderNotFound: 2024,
      PositionNotFound: 2025,
      AccountNotFound: 2026,
      InvalidNonce: 2040,
      NonceAlreadyUsed: 2041,
      NonceExpired: 2042,
      PayloadMismatch: 2050,
      RouteNotFound: 2060,
      SetupRequired: 2070,
      FeatureUnavailable: 2080,
    } as const satisfies Partial<Record<keyof typeof PerpsErrorCode, number>>

    for (const [name, value] of Object.entries(published)) {
      expect(PerpsErrorCode).toHaveProperty(name, value)
    }
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
