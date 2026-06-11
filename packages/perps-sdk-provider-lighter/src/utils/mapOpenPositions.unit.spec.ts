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

const lookup = new Map([[0, { displaySymbol: 'BTC', logoURI: '' }]])

describe('mapOpenPositions', () => {
  it('drops zero-size rows and maps the rest', () => {
    const positions = mapOpenPositions(
      [rawPosition(), rawPosition({ position: '0' })],
      lookup
    )
    expect(positions).toHaveLength(1)
    expect(positions[0].size).toBe('1')
    expect(positions[0].market.baseAsset.displaySymbol).toBe('BTC')
  })

  it('prefers the backend lookup over the wire symbol', () => {
    const positions = mapOpenPositions(
      [rawPosition({ symbol: 'XBT' })],
      new Map([[0, { displaySymbol: 'BTC', logoURI: '' }]])
    )
    expect(positions[0].market.baseAsset.displaySymbol).toBe('BTC')
  })

  it('falls back to the wire symbol when the lookup misses', () => {
    const positions = mapOpenPositions(
      [rawPosition({ market_id: 9, symbol: 'SOL' })],
      lookup
    )
    expect(positions[0].market.baseAsset.displaySymbol).toBe('SOL')
  })

  it('falls back to a synthetic market_<id> when both lookup and wire symbol miss', () => {
    const positions = mapOpenPositions(
      [rawPosition({ market_id: 9, symbol: undefined })],
      lookup
    )
    expect(positions[0].market.baseAsset.displaySymbol).toBe('market_9')
  })
})
