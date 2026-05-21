import { describe, expect, it } from 'vitest'
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

  it('preserves the base64url-of-JSON shape backend consumers expect', () => {
    const env: LighterActivityCursor = { deposits: 'dep:1' }
    const encoded = encodeActivityCursor(env)
    expect(encoded).toBeDefined()
    if (!encoded) {
      throw new Error('encoded is undefined')
    }
    // base64url uses A-Z, a-z, 0-9, -, _ — no padding, no + or /
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    // round-tripping through `Buffer.from(s, 'base64url').toString('utf8')`
    // (Node) and `atob(toStandardBase64(s))` (browser) MUST yield identical
    // JSON; we exercise the Node path here.
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
    expect(JSON.parse(decoded)).toEqual({ deposits: 'dep:1' })
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
