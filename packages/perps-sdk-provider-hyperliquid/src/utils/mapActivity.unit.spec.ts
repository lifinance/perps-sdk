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
  baseAsset: {
    providerId: PROVIDER,
    id: coin,
    displaySymbol: coin,
    logoURI: '',
  },
  quoteAsset: {
    providerId: PROVIDER,
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: '',
  },
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

// Hyperliquid stamps every `userFunding` entry with the zero hash — funding is
// a system ledger event, so there is no per-entry venue transaction.
const ZERO_HASH = `0x${'0'.repeat(64)}`

const fundingUpdate = (coin: string, time: number): HlFundingUpdate => ({
  time,
  hash: ZERO_HASH,
  delta: {
    type: 'funding',
    coin,
    usdc: '0.5',
    szi: '0.1',
    fundingRate: '0.0001',
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
    expect(t.explorerLink).toBe(
      'https://app.hyperliquid.xyz/explorer/tx/0xhash-spot'
    )
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

  it('drops the token id suffix from the asset symbol', () => {
    const entry = spotTransferUpdate({
      token: 'PURR:0xc1fb593aeffbeb02f85e0308e9956a90',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect((result as TransferActivity).asset).toBe('PURR')
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
    expect(t.explorerLink).toBe(
      'https://app.hyperliquid.xyz/explorer/tx/0xhash-send'
    )
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

  it('drops the token id suffix from the asset symbol', () => {
    const entry = sendAssetUpdate({
      token: 'PURR:0xc1fb593aeffbeb02f85e0308e9956a90',
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect((result as TransferActivity).asset).toBe('PURR')
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

describe('mapLedgerEntry — same-account moves', () => {
  it('returns null for a spotTransfer whose sender and recipient are the queried account', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xself',
      delta: {
        type: 'spotTransfer',
        token: 'USDC',
        amount: '10',
        usdcValue: '10',
        user: QUERIED,
        destination: QUERIED,
      },
    }
    expect(mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)).toBeNull()
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
    expect(result.asset).toBe('USDC')
    expect(result.amount).toBe('100')
    expect(result.explorerLink).toBe('https://scan.li.fi/tx/0xdep')
  })

  it('drops a deposit entry that carries no amount', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xdep-no-amount',
      delta: { type: 'deposit' },
    }
    expect(mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)).toBeNull()
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
    expect(result.asset).toBe('USDC')
    expect(result.amount).toBe('50')
    expect(result.fee).toBe('0.5')
    expect(result.explorerLink).toBe('https://scan.li.fi/tx/0xwdr')
  })

  it('omits the withdrawal fee when the venue reports none', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xwdr-no-fee',
      delta: { type: 'withdraw', usdc: '50' },
    }
    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)
    expect(result?.type).toBe(ActivityType.WITHDRAWAL)
    expect(result).not.toHaveProperty('fee')
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
    expect(result.leverageType).toBe('cross')
    expect(result.liquidatedPositions[0].market.id).toBe('ETH')
  })

  it('retains every market and size of a multi-position liquidation', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-multi',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '3000',
        accountValue: '250',
        leverageType: 'cross',
        liquidatedPositions: [
          { coin: 'ETH', szi: '-1.5' },
          { coin: 'BTC', szi: '0.25' },
        ],
      },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      resolveMarket
    ) as LiquidationActivity

    expect(
      result.liquidatedPositions.map((p) => [p.market.id, p.size])
    ).toEqual([
      ['ETH', '-1.5'],
      ['BTC', '0.25'],
    ])
  })

  it('omits unavailable liquidation metrics instead of reporting zero', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-no-metrics',
      delta: {
        type: 'liquidation',
        leverageType: 'isolated',
        liquidatedPositions: [{ coin: 'ETH', szi: '-1.5' }],
      },
    }
    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('liquidatedNotionalPosition')
    expect(result).not.toHaveProperty('accountValue')
  })

  it('returns null for liquidation entries with missing liquidatedPositions', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-missing-positions',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '1000',
        accountValue: '500',
        leverageType: 'cross',
      },
    }
    expect(mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)).toBeNull()
  })

  it('drops a liquidated position the resolver cannot identify', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-partial',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '3000',
        accountValue: '250',
        leverageType: 'cross',
        liquidatedPositions: [
          { coin: 'GHOST', szi: '-1.5' },
          { coin: 'BTC', szi: '0.25' },
        ],
      },
    }
    const result = mapLedgerEntry(entry, PROVIDER, QUERIED, (coin) =>
      coin === 'GHOST' ? undefined : resolveMarket(coin)
    ) as LiquidationActivity

    expect(result.liquidatedPositions).toEqual([
      { market: resolveMarket('BTC'), size: '0.25' },
    ])
  })

  it('returns null when no liquidated position resolves to a market', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-unresolvable',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '1000',
        accountValue: '500',
        leverageType: 'cross',
        liquidatedPositions: [{ coin: 'GHOST', szi: '-1.5' }],
      },
    }
    expect(mapLedgerEntry(entry, PROVIDER, QUERIED, () => undefined)).toBeNull()
  })

  it('returns null for liquidation entries with empty liquidatedPositions', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xliq-empty-positions',
      delta: {
        type: 'liquidation',
        liquidatedNtlPos: '1000',
        accountValue: '500',
        leverageType: 'cross',
        liquidatedPositions: [],
      },
    }
    expect(mapLedgerEntry(entry, PROVIDER, QUERIED, resolveMarket)).toBeNull()
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
    const result = mapFundingActivity(
      fundingUpdate('BTC', 1_700_000_000_000),
      PROVIDER,
      resolveMarket
    )
    expect(result).toEqual({
      id: 'funding:BTC:2023-11-14T22:13:20.000Z',
      provider: PROVIDER,
      timestamp: '2023-11-14T22:13:20.000Z',
      type: ActivityType.FUNDING,
      market: resolveMarket('BTC'),
      amount: '0.5',
      positionSize: '0.1',
      fundingRate: '0.0001',
    })
  })

  it('gives entries sharing the zero hash distinct ids', () => {
    const entries = [
      fundingUpdate('BTC', 1_700_000_000_000),
      fundingUpdate('BTC', 1_700_003_600_000),
      fundingUpdate('ETH', 1_700_000_000_000),
    ]

    const ids = entries.map(
      (entry) => mapFundingActivity(entry, PROVIDER, resolveMarket)?.id
    )

    expect(new Set(ids).size).toBe(entries.length)
  })

  it('keeps the id stable across repeated maps of the same entry', () => {
    const entry = fundingUpdate('BTC', 1_700_000_000_000)

    const first = mapFundingActivity(entry, PROVIDER, resolveMarket)
    const second = mapFundingActivity(entry, PROVIDER, resolveMarket)

    expect(first).not.toBeNull()
    expect(first?.id).toBe(second?.id)
  })

  it('returns null when the resolver cannot identify the coin', () => {
    expect(
      mapFundingActivity(
        fundingUpdate('GHOST', 1_700_000_000_000),
        PROVIDER,
        () => undefined
      )
    ).toBeNull()
  })
})
