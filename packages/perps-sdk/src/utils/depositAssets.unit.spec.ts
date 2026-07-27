import { ChainId } from '@lifi/types'
import { getAddress, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import type { DeclaredDepositAsset } from '../types/deposit.js'
import * as depositAssets from './depositAssets.js'

const declared = Object.entries(depositAssets) as [
  string,
  DeclaredDepositAsset,
][]

describe('declared deposit assets', () => {
  it.each(declared)('%s carries an EIP-55 checksummed address', (_, asset) => {
    expect(asset.address).toBe(getAddress(asset.address))
  })

  it.each(declared)('%s declares a chain and decimals', (_, asset) => {
    expect(asset.chainId).toBeGreaterThan(0)
    expect(asset.decimals).toBeGreaterThan(0)
  })

  it('declares Ethereum mainnet USDC', () => {
    expect(depositAssets.ETHEREUM_USDC).toEqual({
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    })
  })

  it('declares the 6-decimal Hyperliquid perps USDC, not the 8-decimal spot one', () => {
    expect(depositAssets.HYPERLIQUID_USDC).toEqual({
      chainId: 1337,
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    })
  })

  it('declares Lighter venue USDC at the mainnet USDC address on the venue chain', () => {
    expect(depositAssets.LIGHTER_USDC).toEqual({
      chainId: 3586256,
      address: depositAssets.ETHEREUM_USDC.address,
      decimals: 6,
    })
    expect(depositAssets.LIGHTER_USDC.chainId).not.toBe(
      depositAssets.ETHEREUM_USDC.chainId
    )
  })

  it('declares Robinhood Chain USDG', () => {
    expect(depositAssets.ROBINHOOD_USDG).toEqual({
      chainId: 4663,
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      decimals: 6,
    })
  })

  it('declares a native-gas asset for each first-deposit pipeline chain', () => {
    expect(depositAssets.ETHEREUM_NATIVE_GAS).toEqual({
      chainId: ChainId.ETH,
      address: zeroAddress,
      decimals: 18,
    })
    expect(depositAssets.ROBINHOOD_NATIVE_GAS).toEqual({
      chainId: ChainId.OUT,
      address: zeroAddress,
      decimals: 18,
    })
  })
})
