import { describe, expect, it } from 'vitest'
import { assertNever } from './assertNever.js'

describe('assertNever', () => {
  it('throws an exhaustiveness error for an unexpected value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow(
      /Unreachable: exhaustiveness check failed/
    )
  })

  it('serialises the offending value into the message', () => {
    expect(() => assertNever({ provider: 'mystery' } as never)).toThrow(
      JSON.stringify({ provider: 'mystery' })
    )
  })

  it('handles a value that does not serialise to JSON (undefined)', () => {
    // JSON.stringify(undefined) is `undefined`, interpolated as the string.
    expect(() => assertNever(undefined as never)).toThrow(
      'Unreachable: exhaustiveness check failed for value undefined'
    )
  })
})
