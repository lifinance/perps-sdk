import { afterEach, describe, expect, it } from 'vitest'
import {
  HL_CLEARINGHOUSE_STATE,
  HL_META_AND_CTXS_MAIN,
  HL_PERP_DEXS_MAIN_ONLY,
  HL_SPOT_META,
} from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getPositions } from './getPositions.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const responses = {
  perpDexs: HL_PERP_DEXS_MAIN_ONLY,
  metaAndAssetCtxs: HL_META_AND_CTXS_MAIN,
  spotMeta: HL_SPOT_META,
  clearinghouseState: HL_CLEARINGHOUSE_STATE,
}

describe('getPositions', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('drops zero-size positions and enriches the asset display fields', async () => {
    ;({ restore } = installInfoFetchMock({
      ...responses,
      clearinghouseState: {
        ...HL_CLEARINGHOUSE_STATE,
        assetPositions: [
          ...HL_CLEARINGHOUSE_STATE.assetPositions,
          {
            position: {
              coin: 'ETH',
              szi: '0',
              entryPx: '0',
              positionValue: '0',
              liquidationPx: '0',
              unrealizedPnl: '0',
              marginUsed: '0',
              leverage: { type: 'cross', value: 1 },
            },
          },
        ],
      },
    }))

    const result = await getPositions(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.positions).toHaveLength(1)
    const pos = result.positions[0]
    expect(pos.asset.assetId).toBe('BTC')
    expect(pos.asset.market).toBe('hyperliquid')
    expect(pos.asset.displaySymbol).toBe('BTC')
    expect(pos.asset.displayQuote).toBe('USDC')
    expect(pos.size).toBe('0.1')
  })

  it('filters by the assetId-matching `symbol` param', async () => {
    ;({ restore } = installInfoFetchMock(responses))

    const result = await getPositions(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      assetId: 'ETH',
    })
    expect(result.positions).toHaveLength(0)
  })

  it('reports pagination.hasMore=false (HL returns full state in one call)', async () => {
    ;({ restore } = installInfoFetchMock(responses))

    const result = await getPositions(DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.limit).toBe(1)
  })
})
