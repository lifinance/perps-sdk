import { createPerpsClient } from '@lifi/perps-sdk'
import type { Market } from '@lifi/perps-types'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../test/mockFetch.js'
import {
  PM_AVAILABLE_TO_TRADE_ETH,
  PM_AVAILABLE_TO_TRADE_NEAR,
  PM_AVAILABLE_TO_TRADE_PENGU,
  PM_AVAILABLE_TO_TRADE_XPL,
  PM_MARKETS,
  PM_PRICES,
  PM_SNAPSHOT,
  PM_WITHDRAWABLE,
  type RecordedSnapshot,
  STANDARD_AVAILABLE_TO_TRADE_HYPE,
  STANDARD_MARKETS,
  STANDARD_PRICES,
  STANDARD_SNAPSHOT,
  STANDARD_WITHDRAWABLE,
  UNIFIED_AVAILABLE_TO_TRADE_MEGA,
  UNIFIED_MARKETS,
  UNIFIED_PRICES,
  UNIFIED_SNAPSHOT,
  UNIFIED_WITHDRAWABLE,
} from '../test/venueFixtures.js'
import { getAccountSummary } from './accountSummary.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { getAccount } from './services/getAccount.js'
import { getPositions } from './services/getPositions.js'
import { spotPriceById } from './utils/index.js'

const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

const responsesFor = (snapshot: RecordedSnapshot) => ({
  userFees: {
    userAddRate: '0.0002',
    userCrossRate: '0.0005',
    activeReferralDiscount: '0',
  },
  userAbstraction: snapshot.userAbstraction,
  extraAgents: [],
  spotClearinghouseState: snapshot.spotClearinghouseState,
  clearinghouseState: snapshot.clearinghouseState,
})

/** Sum of every recorded spot balance's `total × mid`, USDC included at `$1`. */
const spotTotalTimesMid = (
  snapshot: RecordedSnapshot,
  markets: readonly Market[],
  prices: { marketId: string; midPrice: string; markPrice: string }[]
) => {
  const priceById = spotPriceById(
    markets,
    new Map(prices.map((p) => [p.marketId, Number.parseFloat(p.markPrice)]))
  )
  return snapshot.spotClearinghouseState.balances.reduce(
    (sum, b) =>
      sum + Number.parseFloat(b.total) * (priceById.get(String(b.token)) ?? 0),
    0
  )
}

describe('accountSummary.venue: unified account', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  const load = async () => {
    ;({ restore } = installInfoFetchMock(
      responsesFor(UNIFIED_SNAPSHOT),
      UNIFIED_MARKETS,
      UNIFIED_PRICES
    ))
    const address = UNIFIED_SNAPSHOT.address as Address
    const account = await getAccount(ctx, { address })
    const { positions } = await getPositions(ctx, { address })
    return {
      account,
      positions,
      summary: getAccountSummary(account, positions),
    }
  }

  it('spot USDC hold equals marginSummary.accountValue', () => {
    const usdc = UNIFIED_SNAPSHOT.spotClearinghouseState.balances.find(
      (b) => b.coin === 'USDC'
    )
    expect(usdc?.hold).toBe(
      UNIFIED_SNAPSHOT.clearinghouseState.marginSummary.accountValue
    )
  })

  it('marginSummary.accountValue equals crossMarginSummary.accountValue plus isolated marginUsed', () => {
    const { marginSummary, crossMarginSummary, assetPositions } =
      UNIFIED_SNAPSHOT.clearinghouseState
    const isolatedMarginUsed = assetPositions
      .filter((ap) => ap.position.leverage.type === 'isolated')
      .reduce((sum, ap) => sum + Number.parseFloat(ap.position.marginUsed), 0)
    expect(Number.parseFloat(marginSummary.accountValue)).toBeCloseTo(
      Number.parseFloat(crossMarginSummary.accountValue) + isolatedMarginUsed,
      6
    )
  })

  it.fails('Position.marginUsed equals venue marginUsed for MEGA', async () => {
    const { positions } = await load()
    const mega = positions.find((p) => p.market.id === 'MEGA')
    expect(mega?.marginUsed).toBe(
      UNIFIED_SNAPSHOT.clearinghouseState.assetPositions[0].position.marginUsed
    )
  })

  it.fails('AccountSummary.marginUsed equals marginSummary.totalMarginUsed', async () => {
    const { summary } = await load()
    expect(summary.marginUsed).toBe(
      UNIFIED_SNAPSHOT.clearinghouseState.marginSummary.totalMarginUsed
    )
  })

  it.fails('AccountSummary.availableMargin equals the USDC entry of tokenToAvailableAfterMaintenance', async () => {
    const { summary } = await load()
    const [, usdcAvailable] =
      UNIFIED_SNAPSHOT.spotClearinghouseState
        .tokenToAvailableAfterMaintenance[0]
    expect(summary.availableMargin).toBe(usdcAvailable)
  })

  it.fails('AccountSummary.portfolioValue equals the sum of every spot total times mid', async () => {
    const { summary } = await load()
    const expected = spotTotalTimesMid(
      UNIFIED_SNAPSHOT,
      UNIFIED_MARKETS,
      UNIFIED_PRICES
    )
    expect(Number.parseFloat(summary.portfolioValue)).toBeCloseTo(expected, 6)
  })

  it.fails('AccountSummary.availableMargin is positive', async () => {
    const { summary } = await load()
    expect(Number.parseFloat(summary.availableMargin)).toBeGreaterThan(0)
  })

  it('records withdrawable and MEGA availableToTrade as named constants', () => {
    expect(UNIFIED_WITHDRAWABLE).toBe('0.6975')
    expect(UNIFIED_AVAILABLE_TO_TRADE_MEGA).toEqual([
      '103.239708',
      '3439.23088',
    ])
  })
})

describe('accountSummary.venue: standard account', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  const load = async () => {
    ;({ restore } = installInfoFetchMock(
      responsesFor(STANDARD_SNAPSHOT),
      STANDARD_MARKETS,
      STANDARD_PRICES
    ))
    const address = STANDARD_SNAPSHOT.address as Address
    const account = await getAccount(ctx, { address })
    const { positions } = await getPositions(ctx, { address })
    return {
      account,
      positions,
      summary: getAccountSummary(account, positions),
    }
  }

  it.fails('Position.marginUsed equals venue marginUsed for HYPE', async () => {
    const { positions } = await load()
    const hype = positions.find((p) => p.market.id === 'HYPE')
    expect(hype?.marginUsed).toBe(
      STANDARD_SNAPSHOT.clearinghouseState.assetPositions[0].position.marginUsed
    )
  })

  it.fails('AccountSummary.marginUsed equals marginSummary.totalMarginUsed', async () => {
    const { summary } = await load()
    expect(summary.marginUsed).toBe(
      STANDARD_SNAPSHOT.clearinghouseState.marginSummary.totalMarginUsed
    )
  })

  it.fails('AccountSummary.availableMargin equals marginSummary.accountValue minus totalMarginUsed', async () => {
    const { summary } = await load()
    const { accountValue, totalMarginUsed } =
      STANDARD_SNAPSHOT.clearinghouseState.marginSummary
    expect(Number.parseFloat(summary.availableMargin)).toBeCloseTo(
      Number.parseFloat(accountValue) - Number.parseFloat(totalMarginUsed),
      6
    )
  })

  it('AccountSummary.portfolioValue equals marginSummary.accountValue plus the sum of spot total times mid', async () => {
    const { summary } = await load()
    const spotSum = spotTotalTimesMid(
      STANDARD_SNAPSHOT,
      STANDARD_MARKETS,
      STANDARD_PRICES
    )
    const expected =
      Number.parseFloat(
        STANDARD_SNAPSHOT.clearinghouseState.marginSummary.accountValue
      ) + spotSum
    expect(Number.parseFloat(summary.portfolioValue)).toBeCloseTo(expected, 4)
  })

  it('records withdrawable and HYPE availableToTrade as named constants', () => {
    expect(STANDARD_WITHDRAWABLE).toBe('0.0')
    expect(STANDARD_AVAILABLE_TO_TRADE_HYPE).toEqual([
      '431.749348',
      '182.319517',
    ])
  })
})

describe('accountSummary.venue: portfolio-margin account', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  const load = async () => {
    ;({ restore } = installInfoFetchMock(
      responsesFor(PM_SNAPSHOT),
      PM_MARKETS,
      PM_PRICES
    ))
    const address = PM_SNAPSHOT.address as Address
    const account = await getAccount(ctx, { address })
    const { positions } = await getPositions(ctx, { address })
    return {
      account,
      positions,
      summary: getAccountSummary(account, positions),
    }
  }

  it.fails('spot USDC hold equals marginSummary.accountValue', () => {
    const usdc = PM_SNAPSHOT.spotClearinghouseState.balances.find(
      (b) => b.coin === 'USDC'
    )
    expect(usdc?.hold).toBe(
      PM_SNAPSHOT.clearinghouseState.marginSummary.accountValue
    )
  })

  it('marginSummary.accountValue equals crossMarginSummary.accountValue plus isolated marginUsed', () => {
    const { marginSummary, crossMarginSummary, assetPositions } =
      PM_SNAPSHOT.clearinghouseState
    const isolatedMarginUsed = assetPositions
      .filter((ap) => ap.position.leverage.type === 'isolated')
      .reduce((sum, ap) => sum + Number.parseFloat(ap.position.marginUsed), 0)
    expect(Number.parseFloat(marginSummary.accountValue)).toBeCloseTo(
      Number.parseFloat(crossMarginSummary.accountValue) + isolatedMarginUsed,
      6
    )
  })

  it('Position.marginUsed equals venue marginUsed for every cross position', async () => {
    const { positions } = await load()
    for (const ap of PM_SNAPSHOT.clearinghouseState.assetPositions) {
      const position = positions.find((p) => p.market.id === ap.position.coin)
      expect(position?.marginUsed).toBe(ap.position.marginUsed)
    }
  })

  it('AccountSummary.marginUsed equals marginSummary.totalMarginUsed', async () => {
    const { summary } = await load()
    expect(Number.parseFloat(summary.marginUsed)).toBeCloseTo(
      Number.parseFloat(
        PM_SNAPSHOT.clearinghouseState.marginSummary.totalMarginUsed
      ),
      4
    )
  })

  it.fails('AccountSummary.availableMargin equals the USDC entry of tokenToAvailableAfterMaintenance', async () => {
    const { summary } = await load()
    const [, usdcAvailable] =
      PM_SNAPSHOT.spotClearinghouseState.tokenToAvailableAfterMaintenance[0]
    expect(summary.availableMargin).toBe(usdcAvailable)
  })

  it.fails('AccountSummary.portfolioValue equals the sum of every spot total times mid', async () => {
    const { summary } = await load()
    const expected = spotTotalTimesMid(PM_SNAPSHOT, PM_MARKETS, PM_PRICES)
    expect(Number.parseFloat(summary.portfolioValue)).toBeCloseTo(expected, 2)
  })

  it('AccountSummary.availableMargin is positive', async () => {
    const { summary } = await load()
    expect(Number.parseFloat(summary.availableMargin)).toBeGreaterThan(0)
  })

  it('records withdrawable and per-market availableToTrade as named constants', () => {
    expect(PM_WITHDRAWABLE).toBe('0.0')
    expect(PM_AVAILABLE_TO_TRADE_ETH).toEqual([
      '5633169.6935090004',
      '8379750.1542779999',
    ])
    expect(PM_AVAILABLE_TO_TRADE_NEAR).toEqual([
      '5646420.0997519996',
      '6505634.1798919998',
    ])
    expect(PM_AVAILABLE_TO_TRADE_PENGU).toEqual([
      '5646420.1423000004',
      '5846659.7659870004',
    ])
    expect(PM_AVAILABLE_TO_TRADE_XPL).toEqual([
      '5643328.9470849996',
      '5928224.823779',
    ])
  })
})
