import { describe, expect, it } from 'vitest'
import type { ActionParamsMap, CreateActionRequest } from './action.js'
import { ActionType, SigningMethod } from './enums.js'
import type { Address } from './primitives.js'
import type { Provider } from './providers.js'
import {
  META_PROVIDER,
  type VoteMessage,
  type VoteParams,
  type VoteTypedData,
  voteTypeFields,
} from './vote.js'

const VOTER: Address = '0x0000000000000000000000000000000000000003'

const upVoteParams: VoteParams = {
  targetProvider: 'driftv2',
  direction: 'up',
  voteType: 'provider',
}

const voteTypedData: VoteTypedData = {
  domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
  types: { Vote: voteTypeFields },
  primaryType: 'Vote',
  message: {
    targetProvider: 'driftv2',
    direction: 'up',
    voteType: 'provider',
    voter: VOTER,
    timestamp: 1_900_000_000_000,
  },
}

// A vote rides the generic create path with the `meta` sentinel in `provider`
// — the voted-on subject lives in `params.targetProvider`, never `provider`.
const voteCreate: CreateActionRequest = {
  provider: META_PROVIDER,
  address: VOTER,
  action: ActionType.META_VOTE,
  params: upVoteParams,
}

// Inactive provider carrying aggregate vote counts — populated pre-launch only.
const inactiveProviderWithVotes: Provider = {
  key: 'driftv2',
  name: 'Drift v2',
  logoURI: 'https://example.invalid/drift.svg',
  signingMethod: SigningMethod.EIP712,
  active: false,
  setup: [],
  options: [],
  actions: [],
  categories: [],
  upVotes: 128,
  downVotes: 4,
}

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// META_VOTE resolves to VoteParams on the params map — the generic path.
type _MetaVoteParams = Expect<
  Equals<ActionParamsMap[ActionType.META_VOTE], VoteParams>
>

// ActionType is never wider than keyof ActionParamsMap — every action,
// including META_VOTE, rides the generic createAction/executeAction path.
type _ActionTypeCoveredByParamsMap = Expect<
  ActionType extends keyof ActionParamsMap ? true : false
>

// Narrowing the create request on META_VOTE yields VoteParams.
type _CreateMetaVoteParams = Expect<
  Equals<
    Extract<CreateActionRequest, { action: ActionType.META_VOTE }>['params'],
    VoteParams
  >
>

// The voted-on subject is distinct from the transport `provider` field —
// VoteParams carries `targetProvider`, never `provider`.
type _SubjectNotProvider = Expect<
  Equals<Extract<keyof VoteParams, 'provider'>, never>
>

export const _fixtures = {
  upVoteParams,
  voteTypedData,
  voteCreate,
  inactiveProviderWithVotes,
}

export type _TypeAssertions = [
  _MetaVoteParams,
  _ActionTypeCoveredByParamsMap,
  _CreateMetaVoteParams,
  _SubjectNotProvider,
]

describe('META_PROVIDER sentinel', () => {
  it('is the stable string "meta"', () => {
    expect(META_PROVIDER).toBe('meta')
  })

  it('rides the generic createAction path in the provider field', () => {
    expect(voteCreate.provider).toBe('meta')
    if (voteCreate.action === ActionType.META_VOTE) {
      expect(voteCreate.params.targetProvider).toBe('driftv2')
    } else {
      throw new Error('expected META_VOTE variant')
    }
  })
})

describe('Vote EIP-712 typed data', () => {
  it('uses primaryType "Vote"', () => {
    expect(voteTypedData.primaryType).toBe('Vote')
  })

  it('declares the Vote field list in signing order', () => {
    expect(voteTypedData.types.Vote.map((f) => f.name)).toEqual([
      'targetProvider',
      'direction',
      'voteType',
      'voter',
      'timestamp',
    ])
  })

  it('conveys subject, direction, voteType, voter, and a unix-ms timestamp', () => {
    const message: VoteMessage = voteTypedData.message
    expect(message.targetProvider).toBe('driftv2')
    expect(message.direction).toBe('up')
    expect(message.voteType).toBe('provider')
    expect(message.voter).toBe(VOTER)
    expect(message.timestamp).toBe(1_900_000_000_000)
  })
})

describe('VoteParams', () => {
  it('names the voted-on subject as targetProvider, distinct from transport provider', () => {
    expect(upVoteParams.targetProvider).toBe('driftv2')
    expect('provider' in upVoteParams).toBe(false)
  })

  it('accepts a down-vote direction', () => {
    const down: VoteParams = {
      targetProvider: 'gmx',
      direction: 'down',
      voteType: 'provider',
    }
    expect(down.direction).toBe('down')
  })
})

describe('Provider vote counts', () => {
  it('carries upVotes/downVotes on an inactive provider', () => {
    expect(inactiveProviderWithVotes.active).toBe(false)
    expect(inactiveProviderWithVotes.upVotes).toBe(128)
    expect(inactiveProviderWithVotes.downVotes).toBe(4)
  })

  it('admits an active provider with no vote counts', () => {
    const active: Provider = {
      key: 'hyperliquid',
      name: 'Hyperliquid',
      logoURI: 'https://example.invalid/hl.svg',
      signingMethod: SigningMethod.EIP712,
      active: true,
      setup: [],
      options: [],
      actions: [],
      categories: [],
    }
    expect(active.upVotes).toBeUndefined()
    expect(active.downVotes).toBeUndefined()
  })
})
