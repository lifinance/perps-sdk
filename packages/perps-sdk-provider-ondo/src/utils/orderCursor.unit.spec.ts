import { PerpsError } from '@lifi/perps-sdk'
import { describe, expect, it } from 'vitest'
import { decodeOrderCursor, encodeOrderCursor } from './orderCursor.js'

describe('Ondo order cursors', () => {
  it('retains independent endpoint positions and a running TWAP snapshot', () => {
    const cursor = {
      active: { cursor: 'next/active', offset: 0 },
      history: { cursor: 'next/history', offset: 1, limit: 2 },
      twaps: [],
    }
    expect(decodeOrderCursor(encodeOrderCursor(cursor))).toEqual(cursor)
  })
  it('omits exhausted sources', () => {
    expect(encodeOrderCursor({})).toBeUndefined()
    expect(decodeOrderCursor(undefined)).toBeUndefined()
  })
  it.each([
    'invalid',
    'null',
    '[]',
    '{"active":2}',
    '{"other":"cursor"}',
    '{"open":{"offset":0}}',
    '{"active":{"offset":-1}}',
    '{"active":{"offset":0,"cursor":2}}',
    '{"history":{"offset":0,"limit":0}}',
    '{"twaps":{"offset":1}}',
    '{"twaps":[null]}',
  ])('rejects malformed cursor %s', (cursor) => {
    expect(() => decodeOrderCursor(cursor)).toThrow(PerpsError)
  })
})
