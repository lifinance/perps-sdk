import type { MarketDisplay } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { LtAccountPosition } from '../types/index.js'
import { mapOpenPositions } from './mapOpenPositions.js'

const rawPosition = (
  overrides: Partial<LtAccountPosition> = {}
): LtAccountPosition => ({
  market_id: 0,
  symbol: 'BTC',
  initial_margin_fraction: '5.00',
  open_order_count: 0,
  pending_order_count: 0,
  position_tied_order_count: 0,
  sign: 1,
  position: '1.0',
  avg_entry_price: '50000',
  position_value: '50000',
  unrealized_pnl: '10',
  realized_pnl: '0',
  liquidation_price: '40000',
  total_funding_paid_out: '0',
  margin_mode: 0,
  allocated_margin: '2500',
  total_discount: '0',
  ...overrides,
})

const market = (id: number, symbol: string): MarketDisplay => ({
  providerId: 'lighter',
  id: String(id),
  categoryId: 'lighter',
  baseAsset: { providerId: 'lighter', id: String(id), displaySymbol: symbol },
  quoteAsset: { providerId: 'lighter', id: 'USDC', displaySymbol: 'USDC' },
})

const SYMBOLS: Record<number, string> = { 0: 'BTC', 1: 'ETH' }
const resolveMarket = (id: number): MarketDisplay => market(id, SYMBOLS[id])

describe('mapOpenPositions', () => {
  it('drops zero-size rows and maps the rest', () => {
    const positions = mapOpenPositions(
      [rawPosition(), rawPosition({ position: '0' })],
      resolveMarket
    )
    expect(positions).toHaveLength(1)
    expect(positions[0].size).toBe('1')
    expect(positions[0].market.baseAsset.displaySymbol).toBe('BTC')
  })

  it('resolves each position market by market_id', () => {
    const positions = mapOpenPositions(
      [rawPosition({ market_id: 1, symbol: 'WETH' })],
      resolveMarket
    )
    expect(positions[0].market.id).toBe('1')
    expect(positions[0].market.baseAsset.displaySymbol).toBe('ETH')
  })
})
