import type { Asset } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  applyLogoOverride,
  spotLogoURI,
  UNIT_TOKEN_NAMES,
} from './assetLogo.js'

const HYPE_LOGO_URI =
  'https://static.debank.com/image/hyper_token/logo_url/hyper/0b3e288cfe418e9ce69eef4c96374583.png'

describe('spotLogoURI', () => {
  it('overrides USDC to the non-suffixed CDN path', () => {
    expect(spotLogoURI('USDC')).toBe(
      'https://app.hyperliquid.xyz/coins/USDC.svg'
    )
  })

  it('overrides USDT0 to USDT’s icon', () => {
    expect(spotLogoURI('USDT0')).toBe(
      'https://app.hyperliquid.xyz/coins/USDT.svg'
    )
  })

  it('overrides HYPE to the debank PNG', () => {
    expect(spotLogoURI('HYPE')).toBe(HYPE_LOGO_URI)
  })

  it('resolves USDE via the base _spot rule', () => {
    expect(spotLogoURI('USDE')).toBe(
      'https://app.hyperliquid.xyz/coins/USDE_spot.svg'
    )
  })

  it('resolves USDH via the base _spot rule', () => {
    expect(spotLogoURI('USDH')).toBe(
      'https://app.hyperliquid.xyz/coins/USDH_spot.svg'
    )
  })

  it('resolves a Unit-bridged token to its underlying icon when fullName is present', () => {
    expect(spotLogoURI('UBTC', 'Unit Bitcoin')).toBe(
      'https://app.hyperliquid.xyz/coins/BTC.svg'
    )
  })

  it('degrades a Unit-bridged token to the base _spot rule when fullName is absent', () => {
    expect(spotLogoURI('UBTC')).toBe(
      'https://app.hyperliquid.xyz/coins/UBTC_spot.svg'
    )
  })

  it('resolves an unmapped Unit token to the empty string', () => {
    expect(spotLogoURI('UXYZ', 'Unit Xyz')).toBe('')
  })
})

describe('applyLogoOverride', () => {
  const asset = (displaySymbol: string): Asset => ({
    providerId: 'hyperliquid',
    id: displaySymbol,
    displaySymbol,
    logoURI: `https://app.hyperliquid.xyz/coins/${displaySymbol}.svg`,
  })

  it('replaces the logoURI when a display-symbol override exists', () => {
    expect(applyLogoOverride(asset('HYPE')).logoURI).toBe(HYPE_LOGO_URI)
    expect(applyLogoOverride(asset('USDC')).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDC.svg'
    )
    expect(applyLogoOverride(asset('USDT0')).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDT.svg'
    )
  })

  it('leaves an un-overridden asset untouched', () => {
    const btc = asset('BTC')
    expect(applyLogoOverride(btc)).toEqual(btc)
    expect(applyLogoOverride(asset('USDE')).logoURI).toBe(
      'https://app.hyperliquid.xyz/coins/USDE.svg'
    )
  })
})

describe('UNIT_TOKEN_NAMES', () => {
  it('contains the Unit-bridged token names', () => {
    expect(UNIT_TOKEN_NAMES.has('UBTC')).toBe(true)
    expect(UNIT_TOKEN_NAMES.has('UETH')).toBe(true)
    expect(UNIT_TOKEN_NAMES.has('BTC')).toBe(false)
  })
})
