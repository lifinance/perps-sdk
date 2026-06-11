import { describe, expect, it } from 'vitest'
import { lighterAsset, marketDisplay } from './marketDisplay.js'

describe('lighterAsset', () => {
  it('tags the asset with the lighter provider key and empty logo', () => {
    expect(lighterAsset('0', 'BTC')).toEqual({
      providerId: 'lighter',
      id: '0',
      displaySymbol: 'BTC',
      logoURI: '',
    })
  })
})

describe('marketDisplay', () => {
  it('builds a USDC-quoted MarketDisplay from a market id + display symbol', () => {
    expect(marketDisplay('1', 'ETH')).toEqual({
      providerId: 'lighter',
      id: '1',
      categoryId: 'lighter',
      baseAsset: {
        providerId: 'lighter',
        id: '1',
        displaySymbol: 'ETH',
        logoURI: '',
      },
      quoteAsset: {
        providerId: 'lighter',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: '',
      },
    })
  })

  it('uses the marketId (not the symbol) as the base asset id', () => {
    const display = marketDisplay('42', 'WIF')
    expect(display.id).toBe('42')
    expect(display.baseAsset.id).toBe('42')
    expect(display.baseAsset.displaySymbol).toBe('WIF')
  })
})
