import { SPOT_CATEGORY_ID } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isSpotCategory } from './marketCategory.js'

describe('isSpotCategory', () => {
  it('is true for the spot category id', () => {
    expect(isSpotCategory(SPOT_CATEGORY_ID)).toBe(true)
  })

  it('is false for a perps category id', () => {
    expect(isSpotCategory('hyperliquid')).toBe(false)
  })
})
