import type { MarketDisplay } from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  OndoFundingFeeTransfer,
  OndoLiquidationEvent,
  OndoPosition,
  OndoWalletDeposit,
  OndoWalletWithdrawal,
} from '../types/wire.js'
import {
  mapDepositActivity,
  mapFundingActivity,
  mapLiquidationActivity,
  mapWithdrawalActivity,
} from './mapActivity.js'

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

const DEPOSIT: OndoWalletDeposit = {
  coin: 'USDC',
  size: '1000.00',
  status: 'confirmed',
  txid: '0xabc123',
  fromAddress: '0x054A94b753CBf65D1Bc484F6D41897b48251fbfF',
  time: '2026-07-01T10:30:00Z',
  chainId: 'eth-mainnet',
  usdValue: '1000.00',
  currentConfirmations: 64,
  requiredConfirmations: 64,
}

const WITHDRAWAL: OndoWalletWithdrawal = {
  coin: 'USDC',
  size: '500.00',
  status: 'complete',
  address: '0x054A94b753CBf65D1Bc484F6D41897b48251fbfF',
  withdrawal_id: 'w_9f8e7d6c5b4a3210',
  txid: '0xdef456',
  customer_withdrawal_id: 'my-withdrawal-001',
  time: '2026-07-02T15:45:00Z',
  chainId: 'eth-mainnet',
  usdValue: '500.00',
  usdFee: '1.50',
  from: { id: '10458932786832481', wallet: 'margin' },
}

describe('mapDepositActivity', () => {
  it('maps an Ondo deposit to the public deposit shape', () => {
    expect(mapDepositActivity(DEPOSIT)).toEqual({
      id: 'deposit:0xabc123',
      provider: 'ondo',
      timestamp: '2026-07-01T10:30:00.000Z',
      type: ActivityType.DEPOSIT,
      asset: 'USDC',
      amount: '1000.00',
      explorerLink: 'https://scan.li.fi/tx/0xabc123',
    })
  })

  it('reports the venue coin as the asset for a non-USDC deposit', () => {
    expect(mapDepositActivity({ ...DEPOSIT, coin: 'BTC' }).asset).toBe('BTC')
  })

  it('suffixes the id with the log index when one transaction carries several deposits', () => {
    expect(mapDepositActivity({ ...DEPOSIT, logIndex: '7' }).id).toBe(
      'deposit:0xabc123:7'
    )
  })

  it('omits the explorer link when Ondo reports no transaction id', () => {
    expect(mapDepositActivity({ ...DEPOSIT, txid: '' })).not.toHaveProperty(
      'explorerLink'
    )
  })

  it('keeps two deposits distinct when Ondo reports no transaction id', () => {
    const first = mapDepositActivity({ ...DEPOSIT, txid: '' })
    const second = mapDepositActivity({ ...DEPOSIT, txid: '', size: '250.00' })

    expect(first.id).toBe('deposit:2026-07-01T10:30:00Z:USDC:1000.00')
    expect(second.id).not.toBe(first.id)
  })
})

describe('mapWithdrawalActivity', () => {
  it('maps an Ondo withdrawal to the public withdrawal shape', () => {
    expect(mapWithdrawalActivity(WITHDRAWAL)).toEqual({
      id: 'w_9f8e7d6c5b4a3210',
      provider: 'ondo',
      timestamp: '2026-07-02T15:45:00.000Z',
      type: ActivityType.WITHDRAWAL,
      asset: 'USDC',
      amount: '500.00',
      explorerLink: 'https://scan.li.fi/tx/0xdef456',
    })
  })

  it('omits the fee because Ondo reports it in USD, not in the withdrawn asset', () => {
    expect(
      mapWithdrawalActivity({ ...WITHDRAWAL, coin: 'BTC', usdFee: '4.20' })
    ).not.toHaveProperty('fee')
  })

  it('keeps a pending withdrawal', () => {
    expect(
      mapWithdrawalActivity({ ...WITHDRAWAL, status: 'pending' })
    ).not.toBe(null)
  })

  it('keeps a withdrawal whose status Ondo reports as unknown', () => {
    expect(
      mapWithdrawalActivity({ ...WITHDRAWAL, status: 'unknown' })
    ).not.toBe(null)
  })

  it('drops a withdrawal that moved no value', () => {
    expect(mapWithdrawalActivity({ ...WITHDRAWAL, status: 'failure' })).toBe(
      null
    )
    expect(mapWithdrawalActivity({ ...WITHDRAWAL, status: 'cancelled' })).toBe(
      null
    )
  })

  it('omits the explorer link when Ondo reports no transaction id', () => {
    expect(
      mapWithdrawalActivity({ ...WITHDRAWAL, txid: '' })
    ).not.toHaveProperty('explorerLink')
  })
})
