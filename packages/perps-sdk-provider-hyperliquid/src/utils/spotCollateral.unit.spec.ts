import type { Asset, Balance } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { partitionSpotBalances } from './spotCollateral.js'

const asset = (id: string, displaySymbol: string): Asset => ({
  providerId: 'hyperliquid',
  id,
  displaySymbol,
  logoURI: `https://x/${displaySymbol}.svg`,
})

const bal = (id: string, displaySymbol: string, valueUsd: string): Balance => ({
  categoryId: 'spot',
  asset: asset(id, displaySymbol),
  units: valueUsd,
  valueUsd,
})

// USDC is the category quote asset (token index 0).
const quoteAssetIds = new Set(['0'])

describe('partitionSpotBalances', () => {
  it('classifies a quote asset as full-value collateral', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('0', 'USDC', '1000')],
      quoteAssetIds
    )
    expect(balances).toHaveLength(0)
    expect(collateralBalances).toHaveLength(1)
    expect(collateralBalances[0].valueUsd).toBe('1000')
  })

  it('keeps every non-quote token as a flat holding', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('150', 'HYPE', '6000'), bal('197', 'UBTC', '4000')],
      quoteAssetIds
    )
    expect(collateralBalances).toHaveLength(0)
    expect(balances).toHaveLength(2)
    expect(balances.map((b) => b.valueUsd)).toEqual(['6000', '4000'])
  })

  it('omits zero-unit rows from both partitions', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('0', 'USDC', '0'), bal('150', 'HYPE', '0'), bal('254', 'USOL', '0')],
      quoteAssetIds
    )

    expect(collateralBalances).toEqual([])
    expect(balances).toEqual([])
  })
})
