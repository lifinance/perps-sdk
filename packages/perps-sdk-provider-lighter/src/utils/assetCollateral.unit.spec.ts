import { describe, expect, it } from 'vitest'
import { assetMarginModeInt, isAssetMarginEnabled } from './assetCollateral.js'
import * as barrel from './index.js'

describe('assetMarginModeInt', () => {
  it('maps enabled → MarginEnabled (1)', () => {
    expect(assetMarginModeInt(true)).toBe(1)
  })

  it('maps disabled → MarginDisabled (0)', () => {
    expect(assetMarginModeInt(false)).toBe(0)
  })
})

describe('isAssetMarginEnabled', () => {
  it('decodes MarginEnabled (1) → true', () => {
    expect(isAssetMarginEnabled(1)).toBe(true)
  })

  it('decodes MarginDisabled (0) → false', () => {
    expect(isAssetMarginEnabled(0)).toBe(false)
  })

  it('treats any non-1 int as not enabled', () => {
    expect(isAssetMarginEnabled(2)).toBe(false)
  })

  it('round-trips with assetMarginModeInt', () => {
    expect(isAssetMarginEnabled(assetMarginModeInt(true))).toBe(true)
    expect(isAssetMarginEnabled(assetMarginModeInt(false))).toBe(false)
  })
})

describe('utils public barrel', () => {
  it('re-exports assetMarginModeInt and isAssetMarginEnabled', () => {
    expect(barrel.assetMarginModeInt).toBe(assetMarginModeInt)
    expect(barrel.isAssetMarginEnabled).toBe(isAssetMarginEnabled)
  })
})
