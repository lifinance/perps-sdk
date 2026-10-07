import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWarnOnce, warnSkippedVenueRow } from './warnOnce.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createWarnOnce', () => {
  it('writes each distinct key once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const warnOnce = createWarnOnce()

    warnOnce('a', 'first')
    warnOnce('a', 'second')
    warnOnce('b', 'third')

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'first',
      'third',
    ])
  })

  it('keeps its key memory bounded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const warnOnce = createWarnOnce()

    for (let i = 0; i < 300; i += 1) {
      warnOnce(String(i), `key ${i}`)
    }
    expect(warn).toHaveBeenCalledTimes(300)

    // Key 299 is still in the memory, key 0 left it.
    warn.mockClear()
    warnOnce('299', 'recent')
    warnOnce('0', 'evicted')
    expect(warn.mock.calls.map(([message]) => message)).toEqual(['evicted'])
  })

  it('gives each warner its own key memory', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    createWarnOnce()('a', 'one')
    createWarnOnce()('a', 'two')

    expect(warn.mock.calls.map(([message]) => message)).toEqual(['one', 'two'])
  })
})

describe('warnSkippedVenueRow', () => {
  it('warns once for each provider, row, field and value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnSkippedVenueRow('hyperliquid', 'position', 'szi', 'abc')
    warnSkippedVenueRow('hyperliquid', 'position', 'szi', 'abc')
    warnSkippedVenueRow('hyperliquid', 'position', 'szi', 'xyz')

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      "[hyperliquid] skipping position row: `szi` is not a valid decimal: 'abc'",
      "[hyperliquid] skipping position row: `szi` is not a valid decimal: 'xyz'",
    ])
  })

  it('names the expected kind and cuts a long value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    warnSkippedVenueRow('ondo', 'fill', 'time', 'x'.repeat(100), 'timestamp')

    expect(warn).toHaveBeenCalledWith(
      `[ondo] skipping fill row: \`time\` is not a valid timestamp: '${'x'.repeat(64)}…'`
    )
  })
})
