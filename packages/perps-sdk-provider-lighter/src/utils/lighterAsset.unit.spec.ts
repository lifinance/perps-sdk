import { describe, expect, it } from 'vitest'
import { lighterAsset } from './lighterAsset.js'

describe('lighterAsset', () => {
  it('defaults to the mainnet provider key and an empty logo', () => {
    expect(lighterAsset('0', 'BTC')).toEqual({
      providerId: 'lighter',
      id: '0',
      displaySymbol: 'BTC',
      logoURI: '',
    })
  })

  it('tags the asset with the instance the caller names', () => {
    expect(lighterAsset('3', 'USDG', 'lighter-rh')).toEqual({
      providerId: 'lighter-rh',
      id: '3',
      displaySymbol: 'USDG',
      logoURI: '',
    })
  })
})
