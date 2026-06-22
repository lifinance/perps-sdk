import { ChainId } from '@lifi/types'
import { describe, expect, it } from 'vitest'
import {
  LIFI_DEPOSIT_CHAIN_BY_PROVIDER,
  lifiDepositChainForProvider,
} from './depositChain.js'

describe('LIFI_DEPOSIT_CHAIN_BY_PROVIDER', () => {
  it('maps hyperliquid to the LI.FI Hyperliquid chain', () => {
    expect(LIFI_DEPOSIT_CHAIN_BY_PROVIDER.hyperliquid).toBe(ChainId.HPL)
  })

  it('maps lighter to the LI.FI Lighter chain', () => {
    expect(LIFI_DEPOSIT_CHAIN_BY_PROVIDER.lighter).toBe(ChainId.LTR)
  })

  it('covers exactly the declared providers', () => {
    expect(Object.keys(LIFI_DEPOSIT_CHAIN_BY_PROVIDER).sort()).toEqual([
      'hyperliquid',
      'lighter',
    ])
  })
})

describe('lifiDepositChainForProvider', () => {
  it('resolves known provider keys', () => {
    expect(lifiDepositChainForProvider('hyperliquid')).toBe(ChainId.HPL)
    expect(lifiDepositChainForProvider('lighter')).toBe(ChainId.LTR)
  })

  it('returns undefined for an unknown provider key', () => {
    expect(lifiDepositChainForProvider('binance')).toBeUndefined()
    expect(lifiDepositChainForProvider('')).toBeUndefined()
  })
})
