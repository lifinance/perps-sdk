import { type ActivityItem, ActivityType } from '@lifi/perps-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeActivityCursor,
  encodeActivityCursor,
  type LighterActivityCursor,
} from './activityCursor.js'

describe('activity cursor round-trip', () => {
  it('encodes and decodes a full envelope', () => {
    const env: LighterActivityCursor = {
      deposits: 'dep:42',
      withdraws: 'wd:7',
      fundings: 'fnd:1',
      liquidations: 'liq:9',
      transfers: 'xfer:3',
    }
    const encoded = encodeActivityCursor(env)
    expect(encoded).toBeTypeOf('string')
    expect(decodeActivityCursor(encoded)).toEqual(env)
  })

  it('drops empty/undefined keys before encoding', () => {
    const env: LighterActivityCursor = {
      deposits: 'd',
      withdraws: '',
      fundings: undefined,
    }
    const encoded = encodeActivityCursor(env)
    expect(decodeActivityCursor(encoded)).toEqual({ deposits: 'd' })
  })

  it('returns undefined when every key is empty', () => {
    expect(encodeActivityCursor({})).toBeUndefined()
    expect(
      encodeActivityCursor({ deposits: '', withdraws: undefined })
    ).toBeUndefined()
  })

  it('returns undefined when decoding an absent cursor', () => {
    expect(decodeActivityCursor(undefined)).toBeUndefined()
  })

  it('throws when decoding garbage', () => {
    expect(() => decodeActivityCursor('!!!not-base64url!!!')).toThrow()
    // valid base64url but not JSON
    const notJson = Buffer.from('plain string', 'utf8').toString('base64url')
    expect(() => decodeActivityCursor(notJson)).toThrow()
  })

  it('rejects a JSON cursor with non-string values', () => {
    const bad = Buffer.from(JSON.stringify({ deposits: 42 }), 'utf8').toString(
      'base64url'
    )
    expect(() => decodeActivityCursor(bad)).toThrow(/must be a string/)
  })

  it('round-trips an overflow tail of activity items', () => {
    const overflow: ActivityItem[] = [
      {
        id: 'd1',
        provider: 'lighter',
        timestamp: '2023-11-14T22:13:20.000Z',
        type: ActivityType.DEPOSIT,
        asset: {
          providerId: 'lighter',
          id: '3',
          l1Address: '0xaddress',
          displaySymbol: 'USDC',
          logoURI: 'usdc.svg',
        },
        amount: '100',
      },
    ]
    const env: LighterActivityCursor = { deposits: 'dep:1', overflow }
    const decoded = decodeActivityCursor(encodeActivityCursor(env))
    expect(decoded).toEqual(env)
  })

  it('emits a cursor when only overflow remains (upstream exhausted)', () => {
    const overflow: ActivityItem[] = [
      {
        id: 'w1',
        provider: 'lighter',
        timestamp: '2023-11-14T22:13:20.000Z',
        type: ActivityType.WITHDRAWAL,
        asset: {
          providerId: 'lighter',
          id: '3',
          displaySymbol: 'USDC',
          logoURI: 'usdc.svg',
        },
        amount: '5',
      },
    ]
    const encoded = encodeActivityCursor({ overflow })
    expect(encoded).toBeTypeOf('string')
    expect(decodeActivityCursor(encoded)).toEqual({ overflow })
  })

  it('omits an empty overflow array from the encoded cursor', () => {
    expect(encodeActivityCursor({ overflow: [] })).toBeUndefined()
    expect(
      decodeActivityCursor(
        encodeActivityCursor({ deposits: 'd', overflow: [] })
      )
    ).toEqual({
      deposits: 'd',
    })
  })

  it('rejects a non-array overflow value', () => {
    const bad = Buffer.from(
      JSON.stringify({ overflow: 'not-an-array' }),
      'utf8'
    ).toString('base64url')
    expect(() => decodeActivityCursor(bad)).toThrow(/overflow must be an array/)
  })

  it('rejects a legacy version-1 envelope that carries overflow rows', () => {
    const legacy = Buffer.from(
      JSON.stringify({
        version: 1,
        deposits: 'dep:1',
        overflow: [
          {
            id: 'd1',
            provider: 'lighter',
            timestamp: '2023-11-14T22:13:20.000Z',
            type: ActivityType.DEPOSIT,
            asset: 'USDC',
            amount: '100',
          },
        ],
      }),
      'utf8'
    ).toString('base64url')
    expect(() => decodeActivityCursor(legacy)).toThrow(/legacy overflow format/)
  })

  it('rejects an overflow row that lost its identity or activity type', () => {
    const withRow = (row: unknown): string =>
      Buffer.from(
        JSON.stringify({ version: 2, overflow: [row] }),
        'utf8'
      ).toString('base64url')
    expect(() => decodeActivityCursor(withRow('deposit'))).toThrow(
      /overflow\[0\] must be an object/
    )
    expect(() =>
      decodeActivityCursor(
        withRow({ provider: 'lighter', timestamp: 'now', type: 'deposit' })
      )
    ).toThrow(/overflow\[0\] id must be a string/)
    expect(() =>
      decodeActivityCursor(
        withRow({
          id: 'd1',
          provider: 'lighter',
          timestamp: 'now',
          type: 'airdrop',
        })
      )
    ).toThrow(/overflow\[0\] carries an unknown activity type/)
  })

  it('round-trips a non-latin asset name through the utf-8 codec', () => {
    const env: LighterActivityCursor = { deposits: 'дэп:1' }
    expect(decodeActivityCursor(encodeActivityCursor(env))).toEqual(env)
  })

  it('rejects a non-object JSON cursor', () => {
    const bad = Buffer.from(JSON.stringify(['array']), 'utf8').toString(
      'base64url'
    )
    // Arrays are objects in JS; decode succeeds but skips unknown keys.
    // Strictly invalid is e.g. a bare number.
    const number = Buffer.from('42', 'utf8').toString('base64url')
    expect(() => decodeActivityCursor(number)).toThrow(/expected JSON object/)
    expect(decodeActivityCursor(bad)).toEqual({})
  })
})

describe('activity cursor under a browser Buffer polyfill', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips when the global Buffer lacks the base64url encoding', () => {
    const nodeBuffer = Buffer
    const rejectBase64Url = (encoding: string | undefined) => {
      if (encoding === 'base64url') {
        throw new TypeError('Unknown encoding: base64url')
      }
    }
    const polyfill = {
      from: (value: string, encoding?: string) => {
        rejectBase64Url(encoding)
        const bytes = nodeBuffer.from(value, encoding as BufferEncoding)
        return {
          toString: (target?: string) => {
            rejectBase64Url(target)
            return bytes.toString(target as BufferEncoding)
          },
        }
      },
    }
    vi.stubGlobal('Buffer', polyfill)
    const env: LighterActivityCursor = { deposits: 'dep:1', fundings: 'fnd:ü' }
    const encoded = encodeActivityCursor(env)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeActivityCursor(encoded)).toEqual(env)
  })
})
