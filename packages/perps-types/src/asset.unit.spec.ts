import { describe, expect, it } from 'vitest'
import type { Asset, AssetsResponse } from './asset.js'

const usdc: Asset = {
  providerId: 'lighter',
  id: '0',
  displaySymbol: 'USDC',
  logoURI: 'https://example.com/usdc.png',
}

const eth: Asset = {
  providerId: 'hyperliquid',
  id: 'ETH',
  displaySymbol: 'ETH',
  logoURI: 'https://example.com/eth.png',
  displayName: 'Ethereum',
}

const response: AssetsResponse = {
  assets: [usdc, eth],
}

describe('Asset', () => {
  it('carries providerId, own id, displaySymbol and logoURI', () => {
    expect(usdc.providerId).toBe('lighter')
    expect(usdc.id).toBe('0')
    expect(usdc.displaySymbol).toBe('USDC')
    expect(usdc.logoURI).toBe('https://example.com/usdc.png')
  })

  it('admits an optional displayName', () => {
    expect(usdc.displayName).toBeUndefined()
    expect(eth.displayName).toBe('Ethereum')
  })

  it('carries no collateral flag', () => {
    expect('isMarginCollateral' in usdc).toBe(false)
    expect('marginEligible' in usdc).toBe(false)
  })
})

describe('AssetsResponse', () => {
  it('survives a JSON roundtrip', () => {
    const parsed = JSON.parse(JSON.stringify(response)) as AssetsResponse
    expect(parsed).toEqual(response)
    expect(parsed.assets.map((a) => a.displaySymbol)).toEqual(['USDC', 'ETH'])
  })
})
