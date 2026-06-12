import type {
  DepositActivity,
  LiquidationActivity,
  MarketDisplay,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  HlFundingUpdate,
  HlLedgerDelta,
  HlLedgerUpdate,
  HlSendAssetDelta,
  HlSpotTransferDelta,
} from '../types/index.js'
import { isSendAssetDelta } from '../types/index.js'
import { mapFundingActivity, mapLedgerEntry } from './mapActivity.js'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const PROVIDER = 'hyperliquid'
const QUERIED = '0x1111111111111111111111111111111111111111'
const COUNTERPARTY = '0x2222222222222222222222222222222222222222'

const resolveMarket = (coin: string): MarketDisplay => ({
  providerId: PROVIDER,
  id: coin,
  categoryId: PROVIDER,
  baseAsset: { providerId: PROVIDER, id: coin, displaySymbol: coin },
  quoteAsset: { providerId: PROVIDER, id: 'USDC', displaySymbol: 'USDC' },
})

const spotTransferUpdate = (
  delta: Partial<HlSpotTransferDelta> & {
    user: HlSpotTransferDelta['user']
    destination: HlSpotTransferDelta['destination']
  },
  time = 1_700_000_000_000,
  hash = '0xhash-spot'
): HlLedgerUpdate => ({
  time,
  hash,
  delta: {
    type: 'spotTransfer',
    token: 'USDC',
    amount: '12.5',
    usdcValue: '12.5',
    fee: '0.01',
    nativeTokenFee: '0.0001',
    nonce: 42,
    ...delta,
  },
})

const sendAssetUpdate = (
  delta: Partial<HlSendAssetDelta> & {
    user: HlSendAssetDelta['user']
    destination: HlSendAssetDelta['destination']
  },
  time = 1_700_000_000_000,
  hash = '0xhash-send'
): HlLedgerUpdate => ({
  time,
  hash,
  delta: {
    type: 'send',
    token: 'USDC',
    amount: '20',
    usdcValue: '20',
    sourceDex: '',
    destinationDex: 'spot',
    fee: '0.02',
    nativeTokenFee: '0.0002',
    feeToken: 'USDC',
    nonce: 1_700_000_000_001,
    ...delta,
  },
})

// ---------------------------------------------------------------------------
// mapLedgerEntry — spotTransfer
// ---------------------------------------------------------------------------

describe('mapLedgerEntry — spotTransfer', () => {
  it('maps an OUT transfer (queried address is the sender)', () => {
    const entry = spotTransferUpdate({
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect(result).not.toBeNull()
    const t = result as TransferActivity
    expect(t.type).toBe(ActivityType.TRANSFER)
    expect(t.direction).toBe('OUT')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
    expect(t.counterpartyAccountIndex).toBeUndefined()
    expect(t.asset).toBe('USDC')
    expect(t.amount).toBe('12.5')
    expect(t.provider).toBe(PROVIDER)
    expect(t.id).toBe('0xhash-spot')
    expect(t.timestamp).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('maps an IN transfer (queried address is the recipient)', () => {
    const entry = spotTransferUpdate({
      user: COUNTERPARTY as HlSpotTransferDelta['user'],
      destination: QUERIED as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.direction).toBe('IN')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
  })

  it('lower-cases the counterparty address regardless of the input casing', () => {
    const upperCounterparty = `0x${'A'.repeat(40)}`
    const entry = spotTransferUpdate({
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: upperCounterparty as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.counterpartyAddress).toBe(upperCounterparty.toLowerCase())
    // Sanity: the original input was upper-case so the lower-casing actually did something.
    expect(t.counterpartyAddress).not.toBe(upperCounterparty)
  })

  it('matches the queried address case-insensitively when deriving direction', () => {
    // Queried passed as upper-case, delta `user` is lower-case — should still
    // resolve as OUT because the addresses are equivalent.
    const upperQueried = QUERIED.toUpperCase()
    const entry = spotTransferUpdate({
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, upperQueried, resolveMarket)

    const t = result as TransferActivity
    expect(t.direction).toBe('OUT')
  })

  it('passes the token symbol through as the asset', () => {
    const entry = spotTransferUpdate({
      token: 'HYPE',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.asset).toBe('HYPE')
  })

  it('preserves spotTransfer metadata fields when present', () => {
    const entry = spotTransferUpdate({
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      usdcValue: '12.5',
      fee: '0.01',
      nativeTokenFee: '0.0001',
      nonce: 7,
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.meta).toEqual({
      transferType: 'spotTransfer',
      usdcValue: '12.5',
      fee: '0.01',
      nativeTokenFee: '0.0001',
      nonce: 7,
    })
  })

  it('omits optional meta fields when not present on the delta', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xhash-minimal',
      delta: {
        type: 'spotTransfer',
        token: 'USDC',
        amount: '1',
        usdcValue: '1',
        user: QUERIED as HlSpotTransferDelta['user'],
        destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      },
    }

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.meta).toEqual({
      transferType: 'spotTransfer',
      usdcValue: '1',
    })
  })
})

// ---------------------------------------------------------------------------
// mapLedgerEntry — sendAsset
// ---------------------------------------------------------------------------

describe('mapLedgerEntry — sendAsset', () => {
  it('maps an OUT sendAsset (queried address is the sender)', () => {
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
      sourceDex: '',
      destinationDex: 'spot',
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect(result).not.toBeNull()
    const t = result as TransferActivity
    expect(t.type).toBe(ActivityType.TRANSFER)
    expect(t.direction).toBe('OUT')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
    expect(t.counterpartyAccountIndex).toBeUndefined()
    expect(t.asset).toBe('USDC')
    expect(t.amount).toBe('20')
    expect(t.provider).toBe(PROVIDER)
    expect(t.id).toBe('0xhash-send')
    expect(t.timestamp).toBe(new Date(1_700_000_000_000).toISOString())
  })

  it('maps an IN sendAsset (queried address is the recipient)', () => {
    const entry = sendAssetUpdate({
      user: COUNTERPARTY as HlSendAssetDelta['user'],
      destination: QUERIED as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.direction).toBe('IN')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
  })

  it('returns null for a same-user dex move (user === destination === queried)', () => {
    // User moving their own USDC from main perp ("") to spot ("spot"). This
    // isn't a wallet IN/OUT — surfacing it as TRANSFER would lie about the
    // direction. A future `DEX_TRANSFER` ActivityType would model this.
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: QUERIED as HlSendAssetDelta['destination'],
      sourceDex: '',
      destinationDex: 'spot',
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect(result).toBeNull()
  })

  it('lower-cases the counterparty address regardless of the input casing', () => {
    const upperCounterparty = `0x${'B'.repeat(40)}`
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: upperCounterparty as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.counterpartyAddress).toBe(upperCounterparty.toLowerCase())
    expect(t.counterpartyAddress).not.toBe(upperCounterparty)
  })

  it('matches the queried address case-insensitively when deriving direction', () => {
    const upperQueried = QUERIED.toUpperCase()
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, upperQueried, resolveMarket)

    const t = result as TransferActivity
    expect(t.direction).toBe('OUT')
  })

  it('passes the token symbol through as the asset', () => {
    const entry = sendAssetUpdate({
      token: 'HYPE',
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.asset).toBe('HYPE')
  })

  it('projects sourceDex / destinationDex / fees / nonce / feeToken into meta', () => {
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
      sourceDex: 'xyz',
      destinationDex: '',
      usdcValue: '99.5',
      fee: '0.03',
      nativeTokenFee: '0.0003',
      feeToken: 'USDC',
      nonce: 1_700_000_000_999,
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    const t = result as TransferActivity
    expect(t.meta).toEqual({
      transferType: 'sendAsset',
      sourceDex: 'xyz',
      destinationDex: '',
      usdcValue: '99.5',
      fee: '0.03',
      nativeTokenFee: '0.0003',
      feeToken: 'USDC',
      nonce: 1_700_000_000_999,
    })
  })

  it('isSendAssetDelta narrows on the literal "send" wire-level type', () => {
    // The delta `type` literal Hyperliquid emits on sendAsset action outcomes
    // is `'send'`, not `'sendAsset'`. Guard test confirms the guard checks the
    // wire-level literal and not a hopeful alias.
    const sendDelta: HlLedgerDelta = {
      type: 'send',
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
      sourceDex: '',
      destinationDex: 'spot',
      token: 'USDC',
      amount: '1',
      usdcValue: '1',
      fee: '0',
      nativeTokenFee: '0',
      feeToken: 'USDC',
      nonce: 1,
    }
    expect(isSendAssetDelta(sendDelta)).toBe(true)

    const notSendDelta: HlLedgerDelta = { type: 'sendAsset', usdc: '1' }
    expect(isSendAssetDelta(notSendDelta)).toBe(false)

    const spotDelta: HlLedgerDelta = {
      type: 'spotTransfer',
      token: 'USDC',
      amount: '1',
      usdcValue: '1',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    }
    expect(isSendAssetDelta(spotDelta)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mapLedgerEntry — non-transfer branches
// ---------------------------------------------------------------------------

describe('mapLedgerEntry — non-transfer branches', () => {
  it('maps a deposit', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xdep',
      delta: { type: 'deposit', usdc: '100' },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      resolveMarket
    ) as DepositActivity
    expect(result.type).toBe(ActivityType.DEPOSIT)
    expect(result.amount).toBe('100')
    // HL deposits settle on Arbitrum; `entry.hash` is the Arbitrum tx.
    expect(result.explorerLink).toBe('https://arbiscan.io/tx/0xdep')
  })

  it('maps a withdrawal', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xwdr',
      delta: { type: 'withdraw', usdc: '50', fee: '0.5' },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      resolveMarket
    ) as WithdrawalActivity
    expect(result.type).toBe(ActivityType.WITHDRAWAL)
    expect(result.amount).toBe('50')
    expect(result.fee).toBe('0.5')
    expect(result.explorerLink).toBe('https://arbiscan.io/tx/0xwdr')
  })

  it('maps a liquidation', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '1000',
        accountValue: '500',
        leverageType: 'cross',
        liquidatedPositions: [{ coin: 'ETH', szi: '-1.5' }],
      },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      resolveMarket
    ) as LiquidationActivity
    expect(result.type).toBe(ActivityType.LIQUIDATION)
    expect(result.liquidatedNotionalPosition).toBe('1000')
    expect(result.liquidatedPositions[0].market.id).toBe('ETH')
  })

  it('returns null for unsupported delta types', () => {
    const types = [
      'accountClassTransfer',
      'internalTransfer',
      'subAccountTransfer',
      'somethingNew',
    ]
    for (const type of types) {
      const entry: HlLedgerUpdate = {
        time: 1_700_000_000_000,
        hash: `0xnull-${type}`,
        delta: { type, usdc: '1' },
      }
      expect(mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// mapFundingActivity
// ---------------------------------------------------------------------------

describe('mapFundingActivity', () => {
  it('maps a funding entry', () => {
    const entry: HlFundingUpdate = {
      time: 1_700_000_000_000,
      hash: '0xfund',
      delta: {
        type: 'funding',
        coin: 'BTC',
        usdc: '0.5',
        szi: '0.1',
        fundingRate: '0.0001',
      },
    }
    const result = mapFundingActivity(entry, PROVIDER, resolveMarket)
    expect(result.type).toBe(ActivityType.FUNDING)
    expect(result.market.id).toBe('BTC')
    expect(result.fundingRate).toBe('0.0001')
    expect(result.amount).toBe('0.5')
    expect(result.positionSize).toBe('0.1')
  })
})
