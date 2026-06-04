import type { VoteDirection, VoteType } from './enums.js'
import type { Address } from './primitives.js'
import type { PerpsSignedTypedData, PerpsTypedData } from './typedData.js'

/**
 * EIP-712 message for a {@link VoteType.PROVIDER} vote. The `action` string is
 * the human-readable form the user signs, e.g. `"Upvote hyperliquid"` /
 * `"Downvote hyperliquid"`.
 * @public
 */
export interface VoteMessage {
  action: string
  voteType: VoteType
  provider: string
  direction: VoteDirection
  voter: Address
  /** Unix timestamp in milliseconds. */
  timestamp: number
}

/**
 * EIP-712 typed-data the user signs to cast a vote. Constructed by the backend
 * and relayed to the caller by the SDK; this type only fixes its shape.
 * @public
 */
export type VoteTypedData = PerpsTypedData & {
  primaryType: 'Vote'
  message: VoteMessage
}

/** @public */
export type VoteSignedTypedData = PerpsSignedTypedData & {
  primaryType: 'Vote'
  message: VoteMessage
}

/**
 * Params for the provider-independent VOTE action. No provider key on the
 * request itself — the subject is named by `voteType` + `provider`.
 * @public
 */
export interface VoteParams {
  voteType: VoteType
  /** Key of the provider being voted on (`Provider.key`). */
  provider: string
  direction: VoteDirection
  voter: Address
}

/** @public */
export interface CreateVoteActionResponse {
  typedData: VoteTypedData
}

/** @public */
export interface SubmitVoteRequest {
  voteType: VoteType
  provider: string
  direction: VoteDirection
  voter: Address
  typedData: VoteSignedTypedData
}

/** @public */
export interface SubmitVoteResponse {
  success: boolean
}
