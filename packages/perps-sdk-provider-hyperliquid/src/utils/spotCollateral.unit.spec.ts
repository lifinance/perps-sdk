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
      quoteAssetIds,
      false
    )
    expect(balances).toHaveLength(0)
    expect(collateralBalances).toHaveLength(1)
    expect(collateralBalances[0].collateralWeight).toBeUndefined()
  })

  it('weights HYPE and BTC as collateral at LTV 0.5 under portfolio margin', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('150', 'HYPE', '6000'), bal('197', 'UBTC', '4000')],
      quoteAssetIds,
      true
    )
    expect(balances).toHaveLength(0)
    expect(collateralBalances.map((b) => b.collateralWeight)).toEqual([
      0.5, 0.5,
    ])
  })

  it('keeps HYPE/BTC as flat holdings when not portfolio margin', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('150', 'HYPE', '6000')],
      quoteAssetIds,
      false
    )
    expect(collateralBalances).toHaveLength(0)
    expect(balances).toHaveLength(1)
  })

  it('never treats a non-eligible token as collateral', () => {
    const { collateralBalances, balances } = partitionSpotBalances(
      [bal('254', 'USOL', '500')],
      quoteAssetIds,
      true
    )
    expect(collateralBalances).toHaveLength(0)
    expect(balances).toHaveLength(1)
  })
})
