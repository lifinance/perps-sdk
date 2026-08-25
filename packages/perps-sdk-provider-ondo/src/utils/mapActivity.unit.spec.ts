import type { MarketDisplay } from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
  OndoPosition,
} from '../types/wire.js'
import { mapFundingActivity, mapLiquidationActivity } from './mapActivity.js'

const MARKET: MarketDisplay = {
  providerId: 'ondo',
  id: 'AAPL-USD.P',
  categoryId: 'ondo',
  baseAsset: {
    providerId: 'ondo',
    id: 'AAPL',
    displaySymbol: 'AAPL',
    logoURI: '',
  },
  quoteAsset: {
    providerId: 'ondo',
    id: 'USD',
    displaySymbol: 'USD',
    logoURI: '',
  },
}

const FUNDING: OndoFundingFeeTransfer = {
  market: 'AAPL-USD.P',
  time: '2026-07-01T12:00:00Z',
  markPrice: '202.05',
  positionSize: '10',
  positionDirection: 'long',
  rate: '0.0001',
  payer: 'long',
  amount: '-0.12',
}

const TRIGGERING_POSITION: OndoPosition = {
  market: 'AAPL-USD.P',
  direction: 'long',
  netQuantity: '10',
  averageEntryPrice: '200.5',
  usedMargin: '401',
  unrealizedPnl: '-180',
  markPrice: '182',
  liquidationPrice: '182.3',
  bankruptcyPrice: '180.5',
  maintenanceMargin: '40.1',
  notionalValue: '1820',
  leverage: '5',
  netFundingSinceNeutral: '-0.12',
  returnOnEquity: '-0.44',
}

const LIQUIDATION: OndoLiquidationEvent = {
  id: 'liq-1',
  time: '2026-07-01T14:00:00Z',
  initiatedAt: '2026-07-01T13:59:58Z',
  accountId: 'acct-1',
  status: 'stop',
  insuranceFundUsed: '0',
  adl: false,
  retryCount: 0,
  triggeringPositions: [TRIGGERING_POSITION],
  filledQuoteSize: '1820',
  filledQuantity: '10',
}

describe('mapFundingActivity', () => {
  it('maps a funding transfer, synthesizing a deterministic id', () => {
    expect(mapFundingActivity(FUNDING, MARKET)).toEqual({
      id: 'funding:AAPL-USD.P:2026-07-01T12:00:00.000Z',
      provider: 'ondo',
      timestamp: '2026-07-01T12:00:00.000Z',
      type: ActivityType.FUNDING,
      market: MARKET,
      amount: '-0.12',
      positionSize: '10',
      fundingRate: '0.0001',
    })
  })
})

const SECOND_POSITION: OndoPosition = {
  ...TRIGGERING_POSITION,
  market: 'TSLA-USD.P',
  netQuantity: '4',
}

const SECOND_MARKET: MarketDisplay = {
  ...MARKET,
  id: 'TSLA-USD.P',
  baseAsset: { ...MARKET.baseAsset, id: 'TSLA', displaySymbol: 'TSLA' },
}

const resolveMarket = (market: string): MarketDisplay =>
  market === 'TSLA-USD.P' ? SECOND_MARKET : MARKET

describe('mapLiquidationActivity', () => {
  it('maps a single-position liquidation event', () => {
    expect(mapLiquidationActivity(LIQUIDATION, resolveMarket)).toEqual({
      id: 'liq-1',
      provider: 'ondo',
      timestamp: '2026-07-01T14:00:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedNotionalPosition: '1820',
      leverageType: 'cross',
      liquidatedPositions: [{ market: MARKET, size: '10' }],
    })
  })

  it('retains every market and size of a multi-position liquidation', () => {
    const mapped = mapLiquidationActivity(
      {
        ...LIQUIDATION,
        triggeringPositions: [TRIGGERING_POSITION, SECOND_POSITION],
      },
      resolveMarket
    )

    expect(mapped?.liquidatedPositions).toEqual([
      { market: MARKET, size: '10' },
      { market: SECOND_MARKET, size: '4' },
    ])
  })

  it('omits unavailable liquidation metrics instead of reporting zero', () => {
    const mapped = mapLiquidationActivity(
      { ...LIQUIDATION, filledQuoteSize: undefined },
      resolveMarket
    )

    expect(mapped).not.toBeNull()
    expect(mapped).not.toHaveProperty('liquidatedNotionalPosition')
    expect(mapped).not.toHaveProperty('accountValue')
  })

  it('drops an event that identifies no liquidated position', () => {
    expect(
      mapLiquidationActivity(
        { ...LIQUIDATION, triggeringPositions: undefined },
        resolveMarket
      )
    ).toBeNull()
    expect(
      mapLiquidationActivity(
        { ...LIQUIDATION, triggeringPositions: [] },
        resolveMarket
      )
    ).toBeNull()
  })
})
