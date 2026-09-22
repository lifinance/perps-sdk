import { createPerpsClient } from '@lifi/perps-sdk'
import type { Market, MarketContext } from '@lifi/perps-types'
import type { Address } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../test/mockFetch.js'
import {
  PM_MARKETS,
  PM_PRICES,
  PM_SNAPSHOT,
  type RecordedSnapshot,
  STANDARD_MARKETS,
  STANDARD_PRICES,
  STANDARD_SNAPSHOT,
  UNIFIED_MARKETS,
  UNIFIED_PRICES,
  UNIFIED_SNAPSHOT,
} from '../test/venueFixtures.js'
import { DEFAULT_HYPERLIQUID_API_URL } from './constants.js'
import { getWithdrawableBalances } from './services/getWithdrawableBalances.js'

const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

let restore: (() => void) | undefined
afterEach(() => restore?.())

const load = async (
  snapshot: RecordedSnapshot,
  markets: Market[],
  prices: MarketContext[]
) => {
  ;({ restore } = installInfoFetchMock(
    {
      userAbstraction: snapshot.userAbstraction,
      clearinghouseState: snapshot.clearinghouseState,
      spotClearinghouseState: snapshot.spotClearinghouseState,
    },
    markets,
    prices
  ))
  return getWithdrawableBalances(ctx, {
    address: snapshot.address as Address,
  })
}

describe('getWithdrawableBalances.venue: unified account', () => {
  it('returns a spot row per held token and the perps withdrawable row', async () => {
    const rows = await load(UNIFIED_SNAPSHOT, UNIFIED_MARKETS, UNIFIED_PRICES)
    expect(rows).toEqual([
      { assetId: '0', route: 'spot', available: '102.54975228' },
      { assetId: '73', route: 'spot', available: '6.15' },
      { assetId: '150', route: 'spot', available: '2.10613124' },
      { assetId: '339', route: 'spot', available: '40.230704' },
      { assetId: '734', route: 'spot', available: '68598.161692' },
      { assetId: '0', route: 'perps', available: '0.6975' },
    ])
  })

  it('draws the perps row from clearinghouseState.withdrawable', async () => {
    const rows = await load(UNIFIED_SNAPSHOT, UNIFIED_MARKETS, UNIFIED_PRICES)
    expect(rows.find((row) => row.route === 'perps')?.available).toBe(
      UNIFIED_SNAPSHOT.clearinghouseState.withdrawable
    )
  })
})

describe('getWithdrawableBalances.venue: standard account', () => {
  it('returns no row because the recorded withdrawable is zero', async () => {
    const rows = await load(
      STANDARD_SNAPSHOT,
      STANDARD_MARKETS,
      STANDARD_PRICES
    )
    expect(STANDARD_SNAPSHOT.clearinghouseState.withdrawable).toBe('0.0')
    expect(rows).toEqual([])
  })
})

describe('getWithdrawableBalances.venue: portfolio margin account', () => {
  it('returns a spot row per held token and no perps row', async () => {
    const rows = await load(PM_SNAPSHOT, PM_MARKETS, PM_PRICES)
    expect(rows).toEqual([
      { assetId: '0', route: 'spot', available: '3573826.69076083' },
      { assetId: '146', route: 'spot', available: '7.43118' },
      { assetId: '150', route: 'spot', available: '0.00338262' },
      { assetId: '154', route: 'spot', available: '0.01435139' },
      { assetId: '307', route: 'spot', available: '220.32122253' },
      { assetId: '734', route: 'spot', available: '6923.026638' },
    ])
  })
})
