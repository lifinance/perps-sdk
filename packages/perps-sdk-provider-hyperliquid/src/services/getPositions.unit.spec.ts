import { createPerpsClient } from '@lifi/perps-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { HL_CLEARINGHOUSE_STATE, HL_MARKETS } from '../../test/fixtures.js'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getPositions } from './getPositions.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})

const responses = {
  clearinghouseState: HL_CLEARINGHOUSE_STATE,
}

describe('getPositions', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('drops zero-size positions and enriches the asset display fields', async () => {
    ;({ restore } = installInfoFetchMock(
      {
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
      },
      HL_MARKETS
    ))

    const result = await getPositions(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })

    expect(result.provider).toBe('hyperliquid')
    expect(result.positions).toHaveLength(1)
    const pos = result.positions[0]
    expect(pos.market.id).toBe('BTC')
    expect(pos.market.categoryId).toBe('hyperliquid')
    expect(pos.market.baseAsset.displaySymbol).toBe('BTC')
    expect(pos.market.quoteAsset.displaySymbol).toBe('USDC')
    expect(pos.size).toBe('0.1')
  })

  it('filters by the marketId-matching `symbol` param', async () => {
    ;({ restore } = installInfoFetchMock(responses, HL_MARKETS))

    const result = await getPositions(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
      marketId: 'ETH',
    })
    expect(result.positions).toHaveLength(0)
  })

  it('reports pagination.hasMore=false (HL returns full state in one call)', async () => {
    ;({ restore } = installInfoFetchMock(responses, HL_MARKETS))

    const result = await getPositions(client, DEFAULT_HYPERLIQUID_API_URL, {
      address: ADDRESS,
    })
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.limit).toBe(1)
  })
})
