import { describe, expect, it } from 'vitest'
import type { Token, TokensResponse } from './tokens.js'

const usdc: Token = {
  id: 'usdc',
  symbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

// logoURI is optional — a token may omit it.
const minimalToken: Token = {
  id: '0',
  symbol: 'ETH',
}

const response: TokensResponse = {
  tokens: [usdc, minimalToken],
}

describe('Token', () => {
  it('carries id, symbol and an optional logoURI', () => {
    expect(usdc.id).toBe('usdc')
    expect(usdc.symbol).toBe('USDC')
    expect(usdc.logoURI).toBe('https://example.com/usdc.png')
  })

  it('admits a token without a logoURI', () => {
    expect(minimalToken.logoURI).toBeUndefined()
  })
})

describe('TokensResponse', () => {
  it('survives a JSON roundtrip', () => {
    const parsed = JSON.parse(JSON.stringify(response)) as TokensResponse
    expect(parsed).toEqual(response)
    expect(parsed.tokens.map((t) => t.symbol)).toEqual(['USDC', 'ETH'])
  })
})
