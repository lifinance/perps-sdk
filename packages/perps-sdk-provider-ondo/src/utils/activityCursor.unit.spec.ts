import { PerpsError } from '@lifi/perps-sdk'
import { type ActivityItem, ActivityType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type OndoActivityCursor,
} from './activityCursor.js'

const OVERFLOW_ITEM: ActivityItem = {
  id: 'funding:AAPL-USD.P:1751371200000',
  provider: 'ondo',
  timestamp: '2026-07-01T12:00:00.000Z',
  type: ActivityType.FUNDING,
  market: {
    providerId: 'ondo',
    id: 'AAPL-USD.P',
    categoryId: 'ondo',
    baseAsset: {
      providerId: 'ondo',
      id: 'AAPL',
      displaySymbol: 'AAPL',
      logoURI: '',
    },
    quoteAsset: {
      providerId: 'ondo',
      id: 'USD',
      displaySymbol: 'USD',
      logoURI: '',
    },
  },
  amount: '-0.12',
  positionSize: '10',
  fundingRate: '0.0001',
}

describe('encodeActivityCursor / decodeActivityCursor', () => {
  it('round-trips per-endpoint cursors and overflow', () => {
    const envelope: OndoActivityCursor = {
      fundings: 'cursor-f',
      liquidations: 'cursor-l',
      overflow: [OVERFLOW_ITEM],
    }
    const encoded = encodeActivityCursor(envelope)
    expect(encoded).toBeTypeOf('string')
    expect(decodeActivityCursor(encoded)).toEqual(envelope)
  })

  it('drops empty cursor keys and returns undefined for a fully-drained envelope', () => {
    expect(encodeActivityCursor({})).toBeUndefined()
    expect(encodeActivityCursor({ fundings: '', overflow: [] })).toBeUndefined()
    const encoded = encodeActivityCursor({ fundings: 'f', liquidations: '' })
    expect(decodeActivityCursor(encoded)).toEqual({ fundings: 'f' })
  })

  it('decodes an absent cursor as undefined (first page)', () => {
    expect(decodeActivityCursor(undefined)).toBeUndefined()
  })

  it('throws ValidationError on malformed cursors rather than re-paging from the start', () => {
    expect(() => decodeActivityCursor('not-base64url-json!')).toThrowError(
      PerpsError
    )
    // Valid base64url but not an object.
    expect(() =>
      decodeActivityCursor(Buffer.from('"str"').toString('base64url'))
    ).toThrowError(PerpsError)
    // Wrong value type on a cursor key.
    expect(() =>
      decodeActivityCursor(
        Buffer.from(JSON.stringify({ fundings: 5 })).toString('base64url')
      )
    ).toThrowError(PerpsError)
  })
})
