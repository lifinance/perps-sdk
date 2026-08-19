import { describe, expect, it } from 'vitest'
import {
  type AcceptTermsMessage,
  type AcceptTermsParams,
  type AcceptTermsTypedData,
  acceptTermsTypeFields,
} from './acceptTerms.js'
import type { ActionParamsMap, CreateActionRequest } from './action.js'
import { ActionType } from './enums.js'
import { META_PROVIDER } from './metaProvider.js'
import type { Address } from './primitives.js'

const ACCEPTOR: Address = '0x0000000000000000000000000000000000000007'

const acceptTermsParams: AcceptTermsParams = {
  termsVersion: '3',
}

const acceptTermsTypedData: AcceptTermsTypedData = {
  domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
  types: { AcceptTerms: acceptTermsTypeFields },
  primaryType: 'AcceptTerms',
  message: {
    action: 'Accept LI.FI Perps Terms of Service v3',
    acceptor: ACCEPTOR,
    termsVersion: '3',
    timestamp: 1_900_000_000_000,
  },
}

// Terms acceptance rides the generic create path with the `meta` sentinel in
// `provider`; the accepted version lives in `params.termsVersion`.
const acceptTermsCreate: CreateActionRequest = {
  provider: META_PROVIDER,
  address: ACCEPTOR,
  action: ActionType.META_ACCEPT_TERMS,
  params: acceptTermsParams,
}

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// META_ACCEPT_TERMS resolves to AcceptTermsParams on the params map.
type _MetaAcceptTermsParams = Expect<
  Equals<ActionParamsMap[ActionType.META_ACCEPT_TERMS], AcceptTermsParams>
>

// Narrowing the create request on META_ACCEPT_TERMS yields AcceptTermsParams.
type _CreateMetaAcceptTermsParams = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.META_ACCEPT_TERMS }
    >['params'],
    AcceptTermsParams
  >
>

export const _fixtures = {
  acceptTermsParams,
  acceptTermsTypedData,
  acceptTermsCreate,
}

export type _TypeAssertions = [
  _MetaAcceptTermsParams,
  _CreateMetaAcceptTermsParams,
]

describe('META_ACCEPT_TERMS create request', () => {
  it('rides the generic createAction path with the meta sentinel', () => {
    expect(acceptTermsCreate.provider).toBe('meta')
    if (acceptTermsCreate.action === ActionType.META_ACCEPT_TERMS) {
      expect(acceptTermsCreate.params.termsVersion).toBe('3')
    } else {
      throw new Error('expected META_ACCEPT_TERMS variant')
    }
  })
})

describe('AcceptTerms EIP-712 typed data', () => {
  it('uses primaryType "AcceptTerms"', () => {
    expect(acceptTermsTypedData.primaryType).toBe('AcceptTerms')
  })

  it('declares the AcceptTerms field list in signing order', () => {
    expect(acceptTermsTypedData.types.AcceptTerms.map((f) => f.name)).toEqual([
      'action',
      'acceptor',
      'termsVersion',
      'timestamp',
    ])
  })

  it('conveys the acceptor, accepted version, action string, and unix-ms timestamp', () => {
    const message: AcceptTermsMessage = acceptTermsTypedData.message
    expect(message.action).toBe('Accept LI.FI Perps Terms of Service v3')
    expect(message.acceptor).toBe(ACCEPTOR)
    expect(message.termsVersion).toBe('3')
    expect(message.timestamp).toBe(1_900_000_000_000)
  })
})
