import type { Address } from './primitives.js'
import type { PerpsTypedData, TypedDataParameter } from './typedData.js'

/**
 * Sentinel sent in the `provider` field for provider-independent actions
 * (e.g. {@link "./enums.js".ActionType.META_VOTE}). The backend dispatches
 * on this value instead of resolving a real provider plugin.
 * @public
 */
export const META_PROVIDER = 'meta'

/** @public */
export type MetaProvider = typeof META_PROVIDER

/**
 * Vote direction. `up` endorses the subject; `down` opposes it.
 * @public
 */
export type VoteDirection = 'up' | 'down'

/**
 * Discriminates what a vote is about, leaving room for future product-level
 * vote subjects without changing the EIP-712 `primaryType`.
 * @public
 */
export type VoteType = 'provider'

/**
 * Params for an {@link "./enums.js".ActionType.META_VOTE} action.
 *
 * `targetProvider` is the voted-on subject — kept distinct from the transport
 * `provider` field, which carries the {@link META_PROVIDER} sentinel for this
 * provider-independent action.
 * @public
 */
export interface VoteParams {
  /** Key of the inactive provider being voted on (the voted-on subject). */
  targetProvider: string
  direction: VoteDirection
  voteType: VoteType
}

/**
 * EIP-712 message body for a `Vote`. Field order matches {@link voteTypeFields}.
 * @public
 */
export interface VoteMessage {
  /** Key of the inactive provider being voted on. */
  targetProvider: string
  direction: VoteDirection
  voteType: VoteType
  voter: Address
  /** Unix timestamp in milliseconds. */
  timestamp: number
}

/**
 * EIP-712 type member list for the `Vote` primary type. Field order is part of
 * the signed digest and must match the backend's encoder.
 * @public
 */
export const voteTypeFields: readonly TypedDataParameter[] = [
  { name: 'targetProvider', type: 'string' },
  { name: 'direction', type: 'string' },
  { name: 'voteType', type: 'string' },
  { name: 'voter', type: 'address' },
  { name: 'timestamp', type: 'uint256' },
]

/**
 * EIP-712 typed data for a vote, as returned by `createAction` and signed
 * client-side. `primaryType` is always `'Vote'`.
 * @public
 */
export interface VoteTypedData extends PerpsTypedData {
  primaryType: 'Vote'
  types: { Vote: readonly TypedDataParameter[] } & PerpsTypedData['types']
  message: VoteMessage
}
