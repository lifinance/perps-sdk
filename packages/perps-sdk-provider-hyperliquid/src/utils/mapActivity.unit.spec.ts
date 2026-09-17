import { AssetRegistry, createPerpsClient } from '@lifi/perps-sdk'
import type {
  Asset,
  DepositActivity,
  LiquidationActivity,
  MarketDisplay,
  TransferActivity,
  WithdrawalActivity,
} from '@lifi/perps-types'
import { ActivityType } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HlFundingUpdate,
  HlLedgerDelta,
  HlLedgerUpdate,
  HlSendAssetDelta,
  HlSpotTransferDelta,
  HlUserFill,
} from '../types/index.js'
import { isSendAssetDelta } from '../types/index.js'
import {
  mapFundingActivity,
  mapLedgerEntry,
  mapLiquidationFills,
} from './mapActivity.js'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const PROVIDER = 'hyperliquid'
const QUERIED = '0x1111111111111111111111111111111111111111'
const COUNTERPARTY = '0x2222222222222222222222222222222222222222'

const USDC: Asset = {
  providerId: PROVIDER,
  id: '0',
  displaySymbol: 'USDC',
  logoURI: '',
}
const PURR: Asset = {
  providerId: PROVIDER,
  id: '1',
  displaySymbol: 'PURR',
  logoURI: 'purr.svg',
}
const HYPE: Asset = {
  providerId: PROVIDER,
  id: '150',
  displaySymbol: 'HYPE',
  logoURI: 'hype.svg',
}
let assetRegistry: AssetRegistry
beforeEach(async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ assets: [USDC, PURR, HYPE] }), {
      status: 200,
    })
  )
  assetRegistry = new AssetRegistry(
    createPerpsClient({ integrator: 'test', apiKey: 'test' }),
    PROVIDER
  )
  await assetRegistry.sync()
})
afterEach(() => vi.restoreAllMocks())

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect(result).not.toBeNull()
    const t = result as TransferActivity
    expect(t.type).toBe(ActivityType.TRANSFER)
    expect(t.direction).toBe('OUT')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
    expect(t.counterpartyAccountIndex).toBeUndefined()
    expect(t.asset).toEqual(USDC)
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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      upperQueried,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.direction).toBe('OUT')
  })

  it('resolves the spot token symbol to its registry asset', () => {
    const entry = spotTransferUpdate({
      token: 'HYPE',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.asset).toEqual(HYPE)
  })

  it('rejects a spot token the registry does not list', () => {
    const entry = spotTransferUpdate({
      token: 'NOTLISTED',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
    })

    expect(() =>
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toThrow(/stale or mis-keyed asset registry/)
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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.meta).toEqual({
      transferType: 'spotTransfer',
      usdcValue: '12.5',
      nonce: 7,
    })
  })

  it('reports the spotTransfer fee in USDC and the native-token fee in HYPE', () => {
    const entry = spotTransferUpdate({
      token: 'PURR',
      user: QUERIED as HlSpotTransferDelta['user'],
      destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      fee: '1.0',
      nativeTokenFee: '0.25',
    })

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.asset).toEqual(PURR)
    expect(t.fees).toEqual([
      { amount: '1.0', asset: 'USDC' },
      { amount: '0.25', asset: 'HYPE' },
    ])
    expect(t.meta).not.toHaveProperty('fee')
    expect(t.meta).not.toHaveProperty('nativeTokenFee')
  })

  it('reports only the fees the spotTransfer delta carries', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xhash-native-only',
      delta: {
        type: 'spotTransfer',
        token: 'USDC',
        amount: '1',
        usdcValue: '1',
        nativeTokenFee: '0.0001',
        user: QUERIED as HlSpotTransferDelta['user'],
        destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      },
    }

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect((result as TransferActivity).fees).toEqual([
      { amount: '0.0001', asset: 'HYPE' },
    ])
  })

  it('reports only the USDC fee when the spotTransfer delta carries no native-token fee', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xhash-usdc-only',
      delta: {
        type: 'spotTransfer',
        token: 'USDC',
        amount: '1',
        usdcValue: '1',
        fee: '0.01',
        user: QUERIED as HlSpotTransferDelta['user'],
        destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      },
    }

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect((result as TransferActivity).fees).toEqual([
      { amount: '0.01', asset: 'USDC' },
    ])
  })

  it('omits fees when the spotTransfer delta reports none', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xhash-no-fee',
      delta: {
        type: 'spotTransfer',
        token: 'USDC',
        amount: '1',
        usdcValue: '1',
        user: QUERIED as HlSpotTransferDelta['user'],
        destination: COUNTERPARTY as HlSpotTransferDelta['destination'],
      },
    }

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect(result).not.toHaveProperty('fees')
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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect(result).not.toBeNull()
    const t = result as TransferActivity
    expect(t.type).toBe(ActivityType.TRANSFER)
    expect(t.direction).toBe('OUT')
    expect(t.counterpartyAddress).toBe(COUNTERPARTY.toLowerCase())
    expect(t.counterpartyAccountIndex).toBeUndefined()
    expect(t.asset).toEqual(USDC)
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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect(result).toBeNull()
  })

  it('lower-cases the counterparty address regardless of the input casing', () => {
    const upperCounterparty = `0x${'B'.repeat(40)}`
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: upperCounterparty as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      upperQueried,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.direction).toBe('OUT')
  })

  it('resolves the sendAsset token symbol to its registry asset', () => {
    const entry = sendAssetUpdate({
      token: 'HYPE',
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
    })

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.asset).toEqual(HYPE)
  })

  it('projects sourceDex / destinationDex / nonce into meta and fees onto the typed shape', () => {
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

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    const t = result as TransferActivity
    expect(t.meta).toEqual({
      transferType: 'sendAsset',
      sourceDex: 'xyz',
      destinationDex: '',
      usdcValue: '99.5',
      nonce: 1_700_000_000_999,
    })
    expect(t.fees).toEqual([
      { amount: '0.03', asset: 'USDC' },
      { amount: '0.0003', asset: 'HYPE' },
    ])
  })

  it('names the sendAsset feeToken as the fee asset', () => {
    const entry = sendAssetUpdate({
      user: QUERIED as HlSendAssetDelta['user'],
      destination: COUNTERPARTY as HlSendAssetDelta['destination'],
      fee: '0.04',
      nativeTokenFee: '0.0004',
      feeToken: 'PURR',
    })

    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

    expect((result as TransferActivity).fees).toEqual([
      { amount: '0.04', asset: 'PURR' },
      { amount: '0.0004', asset: 'HYPE' },
    ])
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
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toBeNull()
  })
})

describe('mapLedgerEntry — registry failures', () => {
  it.each([
    'spotTransfer',
    'send',
  ] as const)('rejects an unresolved %s asset instead of trusting its symbol', (type) => {
    const builder = type === 'send' ? sendAssetUpdate : spotTransferUpdate
    const entry = builder({
      user: QUERIED,
      destination: COUNTERPARTY,
      token: 'USDC:0xunknown',
    })
    expect(() =>
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toThrow(/stale or mis-keyed/)
  })
})

describe('mapLedgerEntry — vault transfers', () => {
  const deposit: HlLedgerUpdate = {
    hash: 'vault-deposit',
    time: 0,
    delta: { type: 'vaultDeposit', vault: COUNTERPARTY, usdc: '100' },
  }
  const withdrawal: HlLedgerUpdate = {
    hash: 'vault-withdraw',
    time: 1,
    delta: {
      type: 'vaultWithdraw',
      vault: COUNTERPARTY,
      user: QUERIED,
      requestedUsd: '200',
      netWithdrawnUsd: '190',
      commission: '8',
      closingCost: '2',
      basis: '100',
    },
  }

  it('maps a vault deposit as an outbound collateral transfer', () => {
    expect(
      mapLedgerEntry(deposit, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toMatchObject({
      type: ActivityType.TRANSFER,
      direction: 'OUT',
      counterpartyAddress: COUNTERPARTY,
      asset: USDC,
      amount: '100',
      meta: { transferType: 'vaultDeposit' },
    })
  })

  it('maps net vault withdrawals and preserves the accounting fields', () => {
    expect(
      mapLedgerEntry(
        withdrawal,
        PROVIDER,
        QUERIED,
        assetRegistry,
        resolveMarket
      )
    ).toMatchObject({
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAddress: COUNTERPARTY,
      asset: USDC,
      amount: '190',
      meta: {
        transferType: 'vaultWithdraw',
        requestedUsd: '200',
        commission: '8',
        closingCost: '2',
        basis: '100',
      },
    })
  })

  it('derives the withdrawal direction from the queried vault account', () => {
    expect(
      mapLedgerEntry(
        withdrawal,
        PROVIDER,
        COUNTERPARTY,
        assetRegistry,
        resolveMarket
      )
    ).toMatchObject({
      direction: 'OUT',
      counterpartyAddress: QUERIED,
      asset: USDC,
      amount: '190',
    })
  })

  it('rejects a vault-side deposit whose payload identifies no depositor', () => {
    expect(() =>
      mapLedgerEntry(
        deposit,
        PROVIDER,
        COUNTERPARTY,
        assetRegistry,
        resolveMarket
      )
    ).toThrow(/identifies no depositor/)
  })

  it('excludes a withdrawal back to the same vault account', () => {
    const entry: HlLedgerUpdate = {
      ...withdrawal,
      delta: { ...withdrawal.delta, user: COUNTERPARTY },
    }
    expect(
      mapLedgerEntry(
        entry,
        PROVIDER,
        COUNTERPARTY,
        assetRegistry,
        resolveMarket
      )
    ).toBeNull()
  })

  it.each([
    deposit,
    withdrawal,
  ])('rejects unresolved collateral on $hash', async (entry) => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ assets: [PURR] }), { status: 200 })
    )
    await assetRegistry.sync()
    expect(() =>
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toThrow(/stale or mis-keyed/)
  })
})

describe('mapLedgerEntry — collateral transfers', () => {
  it.each([
    'internalTransfer',
    'subAccountTransfer',
  ] as const)('maps both directions of %s with registry collateral', (type) => {
    const entry: HlLedgerUpdate = {
      hash: '0xtransfer',
      time: 1_700_000_000_000,
      delta: {
        type,
        user: QUERIED,
        destination: COUNTERPARTY,
        usdc: '12.5',
        ...(type === 'internalTransfer' ? { fee: '0.1' } : {}),
      },
    }
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toMatchObject({
      type: ActivityType.TRANSFER,
      direction: 'OUT',
      asset: USDC,
      amount: '12.5',
      counterpartyAddress: COUNTERPARTY,
    })
    expect(
      mapLedgerEntry(
        entry,
        PROVIDER,
        COUNTERPARTY,
        assetRegistry,
        resolveMarket
      )
    ).toMatchObject({ direction: 'IN', counterpartyAddress: QUERIED })
  })

  it.each([
    'internalTransfer',
    'subAccountTransfer',
  ] as const)('excludes same-account %s movements', (type) => {
    const entry: HlLedgerUpdate = {
      hash: 'self',
      time: 0,
      delta: { type, user: QUERIED, destination: QUERIED, usdc: '1' },
    }
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toBeNull()
  })

  it('preserves the internal transfer fee in collateral units', () => {
    const entry: HlLedgerUpdate = {
      hash: 'internal',
      time: 0,
      delta: {
        type: 'internalTransfer',
        user: QUERIED,
        destination: COUNTERPARTY,
        usdc: '1',
        fee: '0.1',
      },
    }
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toMatchObject({ fees: [{ amount: '0.1', asset: 'USDC' }] })
  })

  it('rejects collateral transfers when the registry omits collateral', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ assets: [PURR] }), { status: 200 })
    )
    await assetRegistry.sync()
    const entry: HlLedgerUpdate = {
      hash: 'internal',
      time: 0,
      delta: {
        type: 'internalTransfer',
        user: QUERIED,
        destination: COUNTERPARTY,
        usdc: '1',
      },
    }
    expect(() =>
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toThrow(/stale or mis-keyed/)
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
      assetRegistry,
      resolveMarket
    ) as DepositActivity
    expect(result.type).toBe(ActivityType.DEPOSIT)
    expect(result.asset).toEqual(USDC)
    expect(result.amount).toBe('100')
    expect(result.explorerLink).toBe('https://scan.li.fi/tx/0xdep')
  })

  it('omits the counterparty address on a deposit', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xdep-no-counterparty',
      delta: { type: 'deposit', usdc: '100' },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    ) as DepositActivity
    expect(result).not.toHaveProperty('counterpartyAddress')
  })

  it('drops a deposit entry that carries no amount', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xdep-no-amount',
      delta: { type: 'deposit' },
    }
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toBeNull()
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
      assetRegistry,
      resolveMarket
    ) as WithdrawalActivity
    expect(result.type).toBe(ActivityType.WITHDRAWAL)
    expect(result.asset).toEqual(USDC)
    expect(result.amount).toBe('50')
    expect(result.explorerLink).toBe('https://scan.li.fi/tx/0xwdr')
  })

  it('denominates the withdrawal fee in the withdrawn asset', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xwdr-fee',
      delta: { type: 'withdraw', usdc: '50', fee: '0.5' },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    ) as WithdrawalActivity
    expect(result.fee).toEqual({ amount: '0.5', asset: 'USDC' })
    expect(result.fee?.asset).toBe(result.asset.displaySymbol)
  })

  it('omits the withdrawal fee when the venue reports none', () => {
    const entry: HlLedgerUpdate = {
      time: 1_700_000_000_000,
      hash: '0xwdr-no-fee',
      delta: { type: 'withdraw', usdc: '50' },
    }
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )
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
      assetRegistry,
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
      assetRegistry,
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
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      resolveMarket
    )

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
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toBeNull()
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
    const result = mapLedgerEntry(
      entry,
      PROVIDER,
      QUERIED,
      assetRegistry,
      (coin) => (coin === 'GHOST' ? undefined : resolveMarket(coin))
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
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, () => undefined)
    ).toBeNull()
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
    expect(
      mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
    ).toBeNull()
  })

  it('returns null for unsupported delta types', () => {
    const types = ['accountClassTransfer', 'somethingNew']
    for (const type of types) {
      const entry: HlLedgerUpdate = {
        time: 1_700_000_000_000,
        hash: `0xnull-${type}`,
        delta: { type, usdc: '1' },
      }
      expect(
        mapLedgerEntry(entry, PROVIDER, QUERIED, assetRegistry, resolveMarket)
      ).toBeNull()
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

describe('mapLiquidationFills', () => {
  const liquidationFill = (
    overrides: Partial<HlUserFill> = {}
  ): HlUserFill => ({
    tid: 1,
    oid: 10,
    hash: '0xaaa',
    coin: 'BTC',
    side: 'A',
    sz: '0.5',
    px: '40000',
    dir: 'Close Long',
    fee: '1',
    closedPnl: '-100',
    crossed: true,
    time: 1_700_000_000_000,
    startPosition: '1',
    liquidation: {
      liquidatedUser: QUERIED,
      markPx: '40000',
      method: 'market',
    },
    ...overrides,
  })

  it('groups the fills of one order into a single activity', () => {
    expect(
      mapLiquidationFills(
        [
          liquidationFill(),
          liquidationFill({ tid: 2, sz: '0.5', time: 1_700_000_060_000 }),
        ],
        PROVIDER,
        QUERIED,
        resolveMarket,
        new Set()
      )
    ).toEqual([
      {
        id: 'liquidation:10',
        provider: PROVIDER,
        timestamp: '2023-11-14T22:14:20.000Z',
        type: ActivityType.LIQUIDATION,
        liquidatedNotionalPosition: '40000',
        liquidatedPositions: [{ market: resolveMarket('BTC'), size: '1' }],
      },
    ])
  })

  it('drops a fill the ledger already reported under the same hash', () => {
    expect(
      mapLiquidationFills(
        [liquidationFill()],
        PROVIDER,
        QUERIED,
        resolveMarket,
        new Set(['0xaaa'])
      )
    ).toEqual([])
  })

  it('keeps a fill that carries no hash to dedup on', () => {
    expect(
      mapLiquidationFills(
        [liquidationFill({ hash: undefined })],
        PROVIDER,
        QUERIED,
        resolveMarket,
        new Set(['0xaaa'])
      )
    ).toHaveLength(1)
  })

  it('drops a fill that liquidated another account', () => {
    expect(
      mapLiquidationFills(
        [
          liquidationFill({
            liquidation: {
              liquidatedUser: COUNTERPARTY,
              markPx: '40000',
              method: 'market',
            },
          }),
        ],
        PROVIDER,
        QUERIED,
        resolveMarket,
        new Set()
      )
    ).toEqual([])
  })

  it('drops a fill whose coin the resolver cannot identify', () => {
    expect(
      mapLiquidationFills(
        [liquidationFill({ coin: 'GHOST' })],
        PROVIDER,
        QUERIED,
        () => undefined,
        new Set()
      )
    ).toEqual([])
  })
})
