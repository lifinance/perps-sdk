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

describe('mapLiquidationActivity', () => {
  it('maps a liquidation event with its triggering positions', () => {
    expect(mapLiquidationActivity(LIQUIDATION, () => MARKET)).toEqual({
      id: 'liq-1',
      provider: 'ondo',
      timestamp: '2026-07-01T14:00:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedNotionalPosition: '1820',
      accountValue: '0',
      leverageType: 'cross',
      liquidatedPositions: [{ market: MARKET, size: '10' }],
    })
  })

  it('tolerates events without fills or triggering positions', () => {
    const mapped = mapLiquidationActivity(
      {
        ...LIQUIDATION,
        triggeringPositions: undefined,
        filledQuoteSize: undefined,
      },
      () => MARKET
    )
    expect(mapped.liquidatedNotionalPosition).toBe('0')
    expect(mapped.liquidatedPositions).toEqual([])
  })
})
