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
  // Default both counterparties flat — overrides set the side under test.
  taker_position_size_before: '0',
  maker_position_size_before: '0',
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

  // ---------------------------------------------------------------------------
  // Classification — exercises the full Open/Close/Increase/Reduce/Switch
  // taxonomy by feeding the viewer's `*_position_size_before` (signed) into
  // the shared `classifyFillFromPosition`. The mapper picks the field that
  // matches the viewer's maker/taker role on the fill. Regression for
  // ORD-281: trunk would classify any SELL as OPENED_SHORT.
  // ---------------------------------------------------------------------------
  describe('classification', () => {
    it('opens a long when a flat viewer buys', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true, // viewer is taker (the bidder)
          size: '1',
          taker_position_size_before: '0',
          maker_position_size_before: '5', // counterparty — irrelevant here
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.OPENED_LONG)
    })

    it('opens a short when a flat viewer sells', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false, // viewer is taker (the asker)
          size: '1',
          taker_position_size_before: '0',
          maker_position_size_before: '-5',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.OPENED_SHORT)
    })

    it('closes a long when a viewer sells the exact long size', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false, // viewer is taker (the asker)
          size: '1',
          taker_position_size_before: '1', // long before, fully unwinding
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.CLOSED_LONG)
    })

    it('closes a short when a viewer buys the exact short size', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true, // viewer is taker (the bidder)
          size: '1',
          taker_position_size_before: '-1', // short before, fully unwinding
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.CLOSED_SHORT)
    })

    it('reduces a long on a partial sell', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false,
          size: '1',
          taker_position_size_before: '2', // long before, only half sold
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.REDUCED_LONG)
    })

    it('reduces a short on a partial buy', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true,
          size: '1',
          taker_position_size_before: '-2', // short before, only half bought back
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.REDUCED_SHORT)
    })

    it('increases a long when an already-long viewer buys more', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true,
          size: '1',
          taker_position_size_before: '1',
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.INCREASED_LONG)
    })

    it('increases a short when an already-short viewer sells more', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false,
          size: '1',
          taker_position_size_before: '-1',
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.INCREASED_SHORT)
    })

    it('switches long → short when a long viewer over-sells', () => {
      const fill = mapFill(
        baseTrade({
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false,
          size: '2',
          taker_position_size_before: '1', // long 1, sell 2 → short 1
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.SWITCHED_SHORT)
    })

    it('switches short → long when a short viewer over-buys', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true,
          size: '2',
          taker_position_size_before: '-1', // short 1, buy 2 → long 1
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.SWITCHED_LONG)
    })

    // -------------------------------------------------------------------------
    // Maker/taker role MUST select the corresponding `*_position_size_before`.
    // Reading the wrong side would mis-classify when the counterparty's
    // position is in a different state from the viewer's.
    // -------------------------------------------------------------------------
    it('reads taker_position_size_before when the viewer is the taker', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true, // viewer (bidder) is taker
          size: '1',
          taker_position_size_before: '1', // viewer is already long
          maker_position_size_before: '0', // counterparty was flat
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.INCREASED_LONG)
    })

    it('reads maker_position_size_before when the viewer is the maker', () => {
      const fill = mapFill(
        baseTrade({
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: false, // viewer (bidder) is maker
          size: '1',
          taker_position_size_before: '0', // counterparty was flat
          maker_position_size_before: '-2', // viewer was short 2
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(fill.classification).toBe(FillClassification.REDUCED_SHORT)
    })

    // -------------------------------------------------------------------------
    // End-to-end sequence: replays the smallest failing case from ORD-281 —
    // buy 1, then sell 1 — through the mapper and asserts the second fill
    // is CLOSED_LONG (not OPENED_SHORT).
    // -------------------------------------------------------------------------
    it('classifies the closing fill in an OPEN→CLOSE sequence as CLOSED_LONG', () => {
      // Fill 1: viewer buys 1 from flat → OPENED_LONG
      const open = mapFill(
        baseTrade({
          trade_id: 1,
          bid_account_id: ACCOUNT_INDEX,
          ask_account_id: 0,
          is_maker_ask: true, // viewer (bidder) is taker
          size: '1',
          taker_position_size_before: '0',
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(open.classification).toBe(FillClassification.OPENED_LONG)

      // Fill 2: viewer sells 1, now long 1 → CLOSED_LONG (not OPENED_SHORT)
      const close = mapFill(
        baseTrade({
          trade_id: 2,
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false, // viewer (asker) is taker
          size: '1',
          taker_position_size_before: '1',
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(close.classification).toBe(FillClassification.CLOSED_LONG)
    })

    it('classifies the second fill in an OPEN→OVERSELL sequence as SWITCHED_SHORT', () => {
      const switchSell = mapFill(
        baseTrade({
          trade_id: 2,
          ask_account_id: ACCOUNT_INDEX,
          bid_account_id: 0,
          is_maker_ask: false,
          size: '2', // sells 2 while long 1
          taker_position_size_before: '1',
          maker_position_size_before: '0',
        }),
        ACCOUNT_INDEX,
        SYMBOL
      )
      expect(switchSell.classification).toBe(FillClassification.SWITCHED_SHORT)
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
