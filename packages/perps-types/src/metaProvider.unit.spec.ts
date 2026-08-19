import { describe, expect, it } from 'vitest'
import { META_PROVIDER, type MetaProvider } from './metaProvider.js'

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type _MetaProviderIsSentinelLiteral = Expect<Equals<MetaProvider, 'meta'>>

export type _TypeAssertions = [_MetaProviderIsSentinelLiteral]

describe('META_PROVIDER sentinel', () => {
  it('is the stable string "meta"', () => {
    expect(META_PROVIDER).toBe('meta')
  })
})
