import { createPerpsClient, PerpsError, remarkPosition } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getPositions', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
    vi.restoreAllMocks()
  })

  it('skips a position row with an invalid size and keeps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...responses,
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            ...HL_CLEARINGHOUSE_STATE.assetPositions,
            {
              position: {
                ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
                coin: 'ETH',
                szi: 'not-a-number',
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getPositions(ctx, { address: ADDRESS })

    expect(result.positions.map((p) => p.market.id)).toEqual(['BTC'])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "[hyperliquid] skipping position row on market 'ETH': `szi`"
      )
    )
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
                cumFunding: {
                  allTime: '-23403.892773',
                  sinceOpen: '5.788917',
                  sinceChange: '0.0',
                },
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getPositions(ctx, {
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

  it('returns the venue positionValue and the calculated fields', async () => {
    ;({ restore } = installInfoFetchMock(responses, HL_MARKETS))

    const result = await getPositions(ctx, { address: ADDRESS })

    expect(result.positions[0]).toMatchObject({
      markPrice: '95000',
      unrealizedPnl: '100',
      marginUsed: '940',
      leverage: '10',
      positionValue: '9500',
      returnOnEquity: '10.63829787234042553191489361702127659574',
      effectiveLeverage: '10.11',
      liquidationDistance: '10.53',
    })
  })

  it.each([
    null,
    42,
    '+1',
  ])('uses calculated ROE when the HTTP venue ROE is %j', async (returnOnEquity) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;({ restore } = installInfoFetchMock(
      {
        ...responses,
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            {
              position: {
                ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
                returnOnEquity,
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const { positions } = await getPositions(ctx, { address: ADDRESS })

    expect(positions[0].returnOnEquity).toBe(
      '10.63829787234042553191489361702127659574'
    )
  })

  it('keeps venue ROE for a null entry in the HTTP payload and omits calculated ROE after a re-mark', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...responses,
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            {
              position: {
                ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
                entryPx: null,
                liquidationPx: null,
                returnOnEquity: '0.0985',
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const { positions } = await getPositions(ctx, { address: ADDRESS })
    const mapped = positions[0]

    expect(mapped.entryPrice).toBe('0')
    expect(mapped.returnOnEquity).toBe('9.85')
    expect(mapped).not.toHaveProperty('liquidationPrice')

    const remarked = remarkPosition(mapped, '95000')

    expect(remarked.unrealizedPnl).toBe('100')
    expect(remarked).not.toHaveProperty('returnOnEquity')
  })

  it('filters by the marketId-matching `symbol` param', async () => {
    ;({ restore } = installInfoFetchMock(responses, HL_MARKETS))

    const result = await getPositions(ctx, {
      address: ADDRESS,
      marketId: 'ETH',
    })
    expect(result.positions).toHaveLength(0)
  })

  it('reports pagination.hasMore=false (HL returns full state in one call)', async () => {
    ;({ restore } = installInfoFetchMock(responses, HL_MARKETS))

    const result = await getPositions(ctx, {
      address: ADDRESS,
    })
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.limit).toBe(1)
  })

  it('skips an outcome market position', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        ...responses,
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            ...HL_CLEARINGHOUSE_STATE.assetPositions,
            {
              position: {
                ...HL_CLEARINGHOUSE_STATE.assetPositions[0].position,
                coin: '#26140',
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const result = await getPositions(ctx, {
      address: ADDRESS,
    })

    expect(result.positions.map((p) => p.market.id)).toEqual(['BTC'])
  })

  it('throws MarketNotFound for a wire coin absent from /markets', async () => {
    ;({ restore } = installInfoFetchMock(
      {
        clearinghouseState: {
          ...HL_CLEARINGHOUSE_STATE,
          assetPositions: [
            {
              position: {
                coin: 'DOGE',
                szi: '10',
                entryPx: '0.1',
                positionValue: '1',
                liquidationPx: '0.05',
                unrealizedPnl: '0',
                marginUsed: '0.1',
                leverage: { type: 'cross', value: 1 },
                cumFunding: {
                  allTime: '-23403.892773',
                  sinceOpen: '5.788917',
                  sinceChange: '0.0',
                },
              },
            },
          ],
        },
      },
      HL_MARKETS
    ))

    const err = await getPositions(ctx, {
      address: ADDRESS,
    }).catch((e) => e)

    expect(err).toBeInstanceOf(PerpsError)
    expect((err as PerpsError).code).toBe(PerpsErrorCode.MarketNotFound)
  })
})
