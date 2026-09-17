import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWarnOnce } from './warnOnce.js'

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
