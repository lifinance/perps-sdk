import { describe, expect, it } from 'vitest'
import { isHlExplorerTx } from './explorer.js'

const ADDRESS = '0x1234567890123456789012345678901234567890'

const entry = (overrides: Record<string, unknown> = {}): unknown => ({
  time: 1_775_000_000_000,
  user: ADDRESS,
  action: { type: 'order', orders: [{ a: 0, b: true, c: '0xaa' }] },
  block: 1234,
  hash: '0xhash1',
  error: null,
  ...overrides,
})

describe('isHlExplorerTx', () => {
  it('accepts an entry carrying every field the package reads', () => {
    expect(isHlExplorerTx(entry())).toBe(true)
  })

  it('accepts an entry the engine landed but refused', () => {
    expect(isHlExplorerTx(entry({ error: 'Order has zero size.' }))).toBe(true)
  })

  it('accepts an entry whose action is any shape', () => {
    expect(isHlExplorerTx(entry({ action: null }))).toBe(true)
  })

  it.each([
    ['time', { time: '1775000000000' }],
    ['user', { user: 42 }],
    ['block', { block: null }],
    ['hash', { hash: undefined }],
    ['error', { error: 0 }],
  ])('rejects an entry whose %s field drifted', (_field, override) => {
    expect(isHlExplorerTx(entry(override))).toBe(false)
  })

  it.each([
    ['time', 'time'],
    ['user', 'user'],
    ['block', 'block'],
    ['hash', 'hash'],
    ['error', 'error'],
  ])('rejects an entry with no %s field', (_field, key) => {
    const value = entry() as Record<string, unknown>
    delete value[key]
    expect(isHlExplorerTx(value)).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', '0xhash1'],
    ['a number', 1],
    ['an array', []],
  ])('rejects %s', (_label, value) => {
    expect(isHlExplorerTx(value)).toBe(false)
  })
})
