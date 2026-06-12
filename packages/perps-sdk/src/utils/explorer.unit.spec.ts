import { describe, expect, it } from 'vitest'
import { ExplorerChainId, explorerTxUrl } from './explorer.js'

describe('explorerTxUrl', () => {
  it('builds an Etherscan URL for Ethereum L1', () => {
    expect(explorerTxUrl(ExplorerChainId.ETHEREUM, '0xabc')).toBe(
      'https://etherscan.io/tx/0xabc'
    )
  })

  it('builds an Arbiscan URL for Arbitrum One', () => {
    expect(explorerTxUrl(ExplorerChainId.ARBITRUM_ONE, '0xdef')).toBe(
      'https://arbiscan.io/tx/0xdef'
    )
  })

  it('builds a Lighter explorer logs URL for the Lighter L2', () => {
    expect(explorerTxUrl(ExplorerChainId.LIGHTER, '0000abcd')).toBe(
      'https://app.lighter.xyz/explorer/logs/0000abcd'
    )
  })

  it('builds a Hyperliquid explorer URL for Hyperliquid L1 txs', () => {
    expect(explorerTxUrl(ExplorerChainId.HYPERLIQUID, '0x1234')).toBe(
      'https://app.hyperliquid.xyz/explorer/tx/0x1234'
    )
  })

  it('returns undefined for an empty hash', () => {
    expect(explorerTxUrl(ExplorerChainId.ETHEREUM, '')).toBeUndefined()
  })

  it('returns undefined for an absent hash', () => {
    expect(explorerTxUrl(ExplorerChainId.ETHEREUM, undefined)).toBeUndefined()
  })
})
