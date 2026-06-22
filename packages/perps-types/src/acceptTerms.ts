import type { Address } from './primitives.js'
import type { PerpsTypedData, TypedDataParameter } from './typedData.js'

/**
 * Params for an {@link "./enums.js".ActionType.META_ACCEPT_TERMS} action.
 *
 * Provider-independent: cast with the {@link "./vote.js".META_PROVIDER}
 * sentinel in the transport `provider` field.
 * @public
 */
export interface AcceptTermsParams {
  /** Terms-of-Service version being accepted; backend-owned, relayed verbatim. */
  termsVersion: string
}

/**
 * EIP-712 message body for an `AcceptTerms`. Field order matches
 * {@link acceptTermsTypeFields}.
 * @public
 */
export interface AcceptTermsMessage {
  /** Human-readable action, e.g. `"Accept LI.FI Perps Terms of Service v3"`. */
  action: string
  acceptor: Address
  termsVersion: string
  /** Unix timestamp in milliseconds. */
  timestamp: number
}

/**
 * EIP-712 type member list for the `AcceptTerms` primary type. Field order is
 * part of the signed digest and must match the backend's encoder.
 * @public
 */
export const acceptTermsTypeFields: readonly TypedDataParameter[] = [
  { name: 'action', type: 'string' },
  { name: 'acceptor', type: 'address' },
  { name: 'termsVersion', type: 'string' },
  { name: 'timestamp', type: 'uint256' },
]

/**
 * EIP-712 typed data for a terms acceptance, as returned by `createAction` and
 * signed client-side. `primaryType` is always `'AcceptTerms'`.
 * @public
 */
export interface AcceptTermsTypedData extends PerpsTypedData {
  primaryType: 'AcceptTerms'
  types: {
    AcceptTerms: readonly TypedDataParameter[]
  } & PerpsTypedData['types']
  message: AcceptTermsMessage
}
