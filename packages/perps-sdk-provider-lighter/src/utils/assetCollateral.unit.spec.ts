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
  it("decodes 'enabled' → true", () => {
    expect(isAssetMarginEnabled('enabled')).toBe(true)
  })

  it("decodes 'disabled' → false", () => {
    expect(isAssetMarginEnabled('disabled')).toBe(false)
  })
})

describe('utils public barrel', () => {
  it('re-exports assetMarginModeInt and isAssetMarginEnabled', () => {
    expect(barrel.assetMarginModeInt).toBe(assetMarginModeInt)
    expect(barrel.isAssetMarginEnabled).toBe(isAssetMarginEnabled)
  })
})
