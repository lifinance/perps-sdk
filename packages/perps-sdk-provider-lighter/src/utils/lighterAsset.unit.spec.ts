import { describe, expect, it } from 'vitest'
import { lighterAsset } from './lighterAsset.js'

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
