import { DISABLED_RETRY } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HYPERLIQUID_EXPLORER_RPC_URL } from '../constants.js'
import type { HlExplorerTx } from '../types/explorer.js'
import {
  fetchUserTransactions,
  getClientOrderIds,
  matchOrderActionHash,
} from './explorer.js'

const ADDRESS = '0x1234567890123456789012345678901234567890'
const CLOID_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const CLOID_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const CLOID_C = '0xcccccccccccccccccccccccccccccccc'

const tx = (overrides: Partial<HlExplorerTx> = {}): HlExplorerTx => ({
  time: 1_775_000_000_000,
  user: ADDRESS,
  action: { type: 'order', orders: [{ a: 0, b: true, c: CLOID_A }] },
  block: 1234,
  hash: '0xhash1',
  error: null,
  ...overrides,
})

const mockJson = (value: unknown, status = 200) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(value), { status }))

describe('fetchUserTransactions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('POSTs a userDetails body to the explorer RPC and returns the txs', async () => {
    const spy = mockJson({ txs: [tx()] })

    const txs = await fetchUserTransactions(ADDRESS, {
      policy: DISABLED_RETRY,
    })

    expect(spy).toHaveBeenCalledWith(
      HYPERLIQUID_EXPLORER_RPC_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ type: 'userDetails', user: ADDRESS }),
      })
    )
    expect(txs).toEqual([tx()])
  })

  it('drops a malformed entry and keeps the rest', async () => {
    mockJson({
      txs: [
        tx(),
        { time: 'not-a-number', hash: '0xhash2' },
        tx({ hash: '0xhash3' }),
      ],
    })

    const txs = await fetchUserTransactions(ADDRESS, { policy: DISABLED_RETRY })

    expect(txs.map((entry) => entry.hash)).toEqual(['0xhash1', '0xhash3'])
  })

  it('returns an empty list when the response carries no txs array', async () => {
    mockJson({ type: 'error' })

    await expect(
      fetchUserTransactions(ADDRESS, { policy: DISABLED_RETRY })
    ).resolves.toEqual([])
  })

  it('raises a third-party error on a non-2xx status', async () => {
    mockJson({}, 503)

    await expect(
      fetchUserTransactions(ADDRESS, { policy: DISABLED_RETRY })
    ).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
      message: 'Hyperliquid explorer userDetails failed: 503',
    })
  })
})

describe('getClientOrderIds', () => {
  it('returns every id a batched placement names', () => {
    expect(
      getClientOrderIds({
        type: 'order',
        orders: [
          { a: 0, b: true, c: CLOID_A },
          { a: 0, b: false, c: CLOID_B },
          { a: 0, b: false, c: CLOID_C },
        ],
      })
    ).toEqual([CLOID_A, CLOID_B, CLOID_C])
  })

  it('reads the id of a single modify', () => {
    expect(
      getClientOrderIds({ type: 'modify', oid: 7, order: { c: CLOID_A } })
    ).toEqual([CLOID_A])
  })

  it('reads every id of a batch modify', () => {
    expect(
      getClientOrderIds({
        type: 'batchModify',
        modifies: [
          { oid: 7, order: { c: CLOID_A } },
          { oid: 8, order: { c: CLOID_B } },
        ],
      })
    ).toEqual([CLOID_A, CLOID_B])
  })

  it('skips wires with no id, a non-hex id, or the empty hex id', () => {
    expect(
      getClientOrderIds({
        orders: [{ a: 0 }, { c: 'not-hex' }, { c: '0x' }, { c: CLOID_A }],
      })
    ).toEqual([CLOID_A])
  })

  it('returns an empty list for an action that names no order', () => {
    expect(
      getClientOrderIds({ type: 'cancel', cancels: [{ a: 0, o: 9 }] })
    ).toEqual([])
  })
})

describe('matchOrderActionHash', () => {
  const txs = [
    tx({ hash: '0xfirst', action: { type: 'cancel', cancels: [{ o: 9 }] } }),
    tx({
      hash: '0xsecond',
      action: {
        type: 'order',
        orders: [{ c: CLOID_A }, { c: CLOID_B }, { c: CLOID_C }],
      },
    }),
  ]

  it('returns the hash of the transaction whose action carries the id', () => {
    expect(matchOrderActionHash(txs, { clientOrderId: CLOID_C })).toBe(
      '0xsecond'
    )
  })

  it('matches an id the venue echoes in a different case', () => {
    expect(
      matchOrderActionHash(txs, { clientOrderId: CLOID_B.toUpperCase() })
    ).toBe('0xsecond')
  })

  it('returns undefined when no transaction names the id', () => {
    expect(
      matchOrderActionHash(txs, {
        clientOrderId: '0xdddddddddddddddddddddddddddddddd',
      })
    ).toBeUndefined()
  })

  it('returns undefined when the order carries no client order id', () => {
    expect(matchOrderActionHash(txs, {})).toBeUndefined()
  })

  it('returns undefined when the transaction window is empty', () => {
    expect(matchOrderActionHash([], { clientOrderId: CLOID_A })).toBeUndefined()
  })
})
