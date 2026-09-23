import { createMemoryStorage, type PerpsSDKClient } from '@lifi/perps-sdk'
import type { Provider } from '@lifi/perps-types'
import { PositionMarginAdjustment, SigningMethod } from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OndoTokenStore } from './auth/OndoTokenStore.js'
import { ondoProvider } from './OndoProvider.js'
import type { OndoAuthToken } from './types/auth.js'
import type { OndoBalanceSummary, OndoPosition } from './types/wire.js'

// ---------------------------------------------------------------------------
// Recorded-shape venue snapshot. A live Ondo capture is deferred to a human
// run (no funded sandbox account was reachable from this task); the fixture
// below is self-consistent with the `OndoBalanceSummary` invariants Ondo
// publishes (`marginBalance = walletBalance + unrealizedPnl`,
// `availableMargin = marginBalance - usedMargin`) and with the single open
// position's `usedMargin`/`unrealizedPnl`, which the account-level fields
// roll up.
// ---------------------------------------------------------------------------

const ADDRESS = '0x2222222222222222222222222222222222222222' as const
const API_URL = 'https://api.ondoperps-sandbox.xyz'

const STUB_CLIENT = {
  config: { apiUrl: 'https://backend.test/v1/perps' },
} as PerpsSDKClient

const ONDO_COLLATERAL_ASSET = {
  providerId: 'ondo',
  id: 'USDC',
  displaySymbol: 'USDC',
  displayName: 'USD Coin',
  logoURI: '',
}

const PROVIDER_METADATA: Provider = {
  key: 'ondo',
  name: 'Ondo',
  logoURI: '',
  signingMethod: SigningMethod.HMAC,
  active: true,
  setup: [],
  options: [],
  actions: [],
  supportedIntervals: [],
  categories: [{ id: 'ondo', quoteAsset: ONDO_COLLATERAL_ASSET }],
}

const MARKETS_RESPONSE = {
  markets: [
    {
      providerId: 'ondo',
      id: 'ETH-USD.P',
      categoryId: 'ondo',
      baseAsset: {
        providerId: 'ondo',
        id: 'ETH',
        displaySymbol: 'ETH',
        logoURI: '',
      },
      quoteAsset: ONDO_COLLATERAL_ASSET,
      szDecimals: 4,
      priceDecimals: 2,
      markPrice: '2500',
      maxLeverage: 20,
      onlyIsolated: false,
      positionMarginAdjustment: PositionMarginAdjustment.NONE,
      maintenanceMarginRate: 0.05,
      funding: { rate: '0.0001', nextFundingTime: 0 },
    },
  ],
}

const nowSecs = () => Math.floor(Date.now() / 1000)

const AUTH_TOKEN: OndoAuthToken = {
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-venue',
  issuedAtSecs: nowSecs() - 60,
  expirationSecs: nowSecs() + 3600,
  token: 'ondo-jwt-venue',
}

const ACCOUNT_INFO_RESULT = {
  accountID: 'acct-venue',
  identifier: ADDRESS.toLowerCase(),
  authType: 'erc4361',
  accountState: 'open',
  withdrawalFeeUSD: '0',
  termsVersion: 1,
  termsUnixSecs: 1_750_000_000,
  privacyVersion: 1,
  privacyUnixSecs: 1_750_000_000,
  marketingConsent: 'none',
}

const BALANCE: OndoBalanceSummary = {
  walletBalance: '5000',
  realizedPnl: '0',
  unrealizedPnl: '250',
  marginBalance: '5250',
  usedMargin: '900',
  availableMargin: '4350',
  withdrawableMargin: '4350',
  maintenanceMarginRequirement: '300',
  totalMaintenanceMargin: '300',
  marginRatio: '0.171',
  leverage: '3',
  underLiquidation: false,
  totalFundingPayments: '-5.25',
  totalTradingFees: '3',
  totalPnL: '250',
}

const POSITION: OndoPosition = {
  market: 'ETH-USD.P',
  direction: 'long',
  netQuantity: '2.5',
  averageEntryPrice: '2400',
  usedMargin: '900',
  unrealizedPnl: '250',
  markPrice: '2500',
  liquidationPrice: '2050',
  bankruptcyPrice: '2020',
  maintenanceMargin: '300',
  notionalValue: '6250',
  leverage: '3',
  netFundingSinceNeutral: '-5.25',
  returnOnEquity: '0.278',
}

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const envelope = <T>(result: T) => ({ success: true, result })

describe('accountSummary.venue', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('backend.test/v1/perps/markets')) {
          return respond(MARKETS_RESPONSE)
        }
        if (u.includes('backend.test/v1/perps/assets')) {
          return respond({ assets: [ONDO_COLLATERAL_ASSET] })
        }
        if (u.includes('backend.test/v1/perps/providers')) {
          return respond({ providers: [PROVIDER_METADATA] })
        }
        if (u.includes('/v1/perps/balance')) {
          return respond(envelope(BALANCE))
        }
        if (u.includes('/v1/perps/positions')) {
          return respond(envelope([POSITION]))
        }
        if (u.includes('/v1/account/referral')) {
          return respond(envelope(null))
        }
        if (u.includes('/v1/wallet/deposit_address/list')) {
          return respond(envelope([]))
        }
        if (u.includes('/v1/account')) {
          return respond(envelope(ACCOUNT_INFO_RESULT))
        }
        throw new Error(`Unhandled URL in test: ${u}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const load = async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind(STUB_CLIENT)
    const account = await provider.getAccount({ address: ADDRESS })
    const { positions } = await provider.getPositions({ address: ADDRESS })
    return {
      account,
      positions,
      summary: provider.getAccountSummary(account, positions),
    }
  }

  it('AccountSummary.availableMargin equals availableMargin', async () => {
    const { summary } = await load()
    expect(summary.availableMargin).toBe(BALANCE.availableMargin)
  })

  it('AccountSummary.portfolioValue equals marginBalance', async () => {
    const { summary } = await load()
    expect(summary.portfolioValue).toBe(BALANCE.marginBalance)
  })

  it('AccountSummary.marginUsed equals usedMargin', async () => {
    const { summary } = await load()
    expect(summary.marginUsed).toBe(BALANCE.usedMargin)
  })

  it('getWithdrawableBalances returns one perps row of withdrawableMargin', async () => {
    const storage = createMemoryStorage()
    await new OndoTokenStore(storage, API_URL).set(ADDRESS, AUTH_TOKEN)
    const provider = ondoProvider({ apiUrl: API_URL, storage })
    provider.bind(STUB_CLIENT)
    await expect(
      provider.getWithdrawableBalances!({ address: ADDRESS })
    ).resolves.toEqual([
      {
        assetId: ONDO_COLLATERAL_ASSET.id,
        route: 'perps',
        available: BALANCE.withdrawableMargin,
        withdrawalFee: ACCOUNT_INFO_RESULT.withdrawalFeeUSD,
      },
    ])
  })

  it('records walletBalance, unrealizedPnl, marginBalance, usedMargin, and availableMargin as named constants', () => {
    expect(BALANCE.walletBalance).toBe('5000')
    expect(BALANCE.unrealizedPnl).toBe('250')
    expect(BALANCE.marginBalance).toBe('5250')
    expect(BALANCE.usedMargin).toBe('900')
    expect(BALANCE.availableMargin).toBe('4350')
    expect(BALANCE.withdrawableMargin).toBe('4350')
  })
})
