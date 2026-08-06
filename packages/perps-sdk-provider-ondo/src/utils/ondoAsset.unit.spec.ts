import { describe, expect, it } from 'vitest'
import { ondoAsset } from './ondoAsset.js'

describe('ondoAsset', () => {
  it('gives the USD collateral asset the USDC icon', () => {
    expect(ondoAsset('USD', 'USD').logoURI).toBe(
      'https://cdn.ondoperps.xyz/symbol-icons/USDC.svg'
    )
  })

  it('leaves every other asset without an icon', () => {
    expect(ondoAsset('AAPL', 'AAPL').logoURI).toBe('')
  })
})
