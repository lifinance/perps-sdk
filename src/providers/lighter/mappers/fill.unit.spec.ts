import { describe, expect, it } from 'vitest'

import {
  FillClassification,
  FillStatus,
  OrderSide,
  OrderType,
} from '../../../enums.js'
import type { LtTrade } from '../apiTypes.js'
import { mapFill } from './fill.js'

const ACCOUNT_INDEX = 42
const SYMBOL = 'ETH'

const baseTrade = (overrides: Partial<LtTrade> = {}): LtTrade => ({
  trade_id: 7,
  tx_hash: '0xabc',
  type: 'trade',
  market_id: 1,
  size: '1',
  price: '2000',
  usd_amount: '2000',
  ask_id: 100,
  bid_id: 200,
  ask_account_id: 0,
  bid_account_id: ACCOUNT_INDEX,
  is_maker_ask: false,
  block_height: 1,
  timestamp: 1_700_000_000_000,
  taker_fee: 0.7,
  maker_fee: 0.3,
  transaction_time: 1_700_000_000_000,
  ...overrides,
})

describe('mapFill (Lighter)', () => {
  it('stringifies trade_id into Fill.id', () => {
    expect(mapFill(baseTrade({ trade_id: 7 }), ACCOUNT_INDEX, SYMBOL).id).toBe(
      '7'
    )
  })

  it('builds the Lighter asset display with USDC quote', () => {
    expect(mapFill(baseTrade(), ACCOUNT_INDEX, SYMBOL).asset).toEqual({
      assetId: SYMBOL,
      market: 'lighter',
      displaySymbol: SYMBOL,
      displayQuote: 'USDC',
    })
  })

  it('always reports type LIMIT and status FILLED', () => {
    const fill = mapFill(baseTrade(), ACCOUNT_INDEX, SYMBOL)
    expect(fill.type).toBe(OrderType.LIMIT)
    expect(fill.status).toBe(FillStatus.FILLED)
  })

  it('serialises timestamp as ISO string', () => {
    const fill = mapFill(
      baseTrade({ timestamp: 1_700_000_000_000 }),
      ACCOUNT_INDEX,
      SYMBOL
    )
    expect(fill.createdAt).toBe(new Date(1_700_000_000_000).toISOString())
  })

  // -------------------------------------------------------------------------
  // is_maker_ask × isBuyer truth table — drives both side and fee selection.
  //
  // isBuyer is derived from `bid_account_id === accountIndex`. The `isMaker`
  // expression `(is_maker_ask && !isBuyer) || (!is_maker_ask && isBuyer)`
  // collapses to: maker iff the viewer is on the resting side of the trade.
  // -------------------------------------------------------------------------
  describe('side + maker/taker truth table', () => {
    it('viewer on bid + is_maker_ask=true → BUY taker → taker fee', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true,
          taker_fee: 0.7,
          maker_fee: 0.3,
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.side).toBe(OrderSide.BUY)
      expect(fill.fee).toBe('0.7')
    })

    it('viewer on bid + is_maker_ask=false → BUY maker → maker fee', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: false,
          taker_fee: 0.7,
          maker_fee: 0.3,
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.side).toBe(OrderSide.BUY)
      expect(fill.fee).toBe('0.3')
    })

    it('viewer on ask + is_maker_ask=true → SELL maker → maker fee', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: true,
          taker_fee: 0.7,
          maker_fee: 0.3,
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.side).toBe(OrderSide.SELL)
      expect(fill.fee).toBe('0.3')
    })

    it('viewer on ask + is_maker_ask=false → SELL taker → taker fee', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false,
          taker_fee: 0.7,
          maker_fee: 0.3,
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.side).toBe(OrderSide.SELL)
      expect(fill.fee).toBe('0.7')
    })
  })

  describe('classification', () => {
    it('marks viewer-as-buyer trades as OPENED_LONG', () => {
      const fill = mapFill(
        baseTrade({ bid_account_id: ACCOUNT_INDEX, ask_account_id: 0 }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.OPENED_LONG)
    })

    it('marks viewer-as-seller trades as OPENED_SHORT', () => {
      const fill = mapFill(
        baseTrade({ ask_account_id: ACCOUNT_INDEX, bid_account_id: 0 }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.OPENED_SHORT)
    })
  })

  describe('optional fee fields', () => {
    it('returns undefined fee when the relevant fee field is missing', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true, // viewer is taker
          taker_fee: undefined,
          maker_fee: 0.3,
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.fee).toBeUndefined()
    })
  })
})
