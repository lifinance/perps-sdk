import type { Pagination } from './account.js'
import type { Address } from './primitives.js'
import type { PerpsTypedData, TypedDataParameter } from './typedData.js'

/**
 * Reason the backend will not attach a candidate internal referral code to an
 * address. The backend decides; the SDK relays the verdict.
 * @public
 */
export enum ReferralCodeRejection {
  /** The candidate does not match the accepted code format. */
  MALFORMED = 'MALFORMED',
  /** No internal referral code matches the candidate. */
  NOT_FOUND = 'NOT_FOUND',
  /** The code exists but the backend has disabled it. */
  INACTIVE = 'INACTIVE',
  /** The candidate is the queried address's own code. */
  SELF_REFERRAL = 'SELF_REFERRAL',
  /** The address already has an attached code; attachment is first-touch. */
  ALREADY_ATTACHED = 'ALREADY_ATTACHED',
  /** The address no longer meets the backend's conditions for attachment. */
  NOT_ELIGIBLE = 'NOT_ELIGIBLE',
}

/**
 * Backend verdict for a candidate internal referral code.
 * @public
 */
export interface ReferralCodeValidation {
  /** The candidate exactly as submitted. */
  code: string
  valid: boolean
  /** Backend-normalized form of `code`; absent when `valid` is false. */
  normalizedCode?: string
  /** Present only when `valid` is false. */
  rejection?: ReferralCodeRejection
}

/**
 * The internal referral code attached to an address. Attachment is first-touch:
 * once the backend records it, it does not change.
 * @public
 */
export interface AttachedReferralCode {
  /** Normalized code this address is attached to. */
  code: string
  /** Unix epoch milliseconds the attachment was recorded. */
  attachedAt: number
}

/**
 * The shareable internal referral code an address owns.
 * @public
 */
export interface OwnedReferralCode {
  code: string
  /** Unix epoch milliseconds the code was created. */
  createdAt: number
  /** Number of addresses attached to this code. */
  attachedCount: number
}

/**
 * Whether an address may create an owned internal referral code. The backend
 * owns both the threshold and the decision.
 * @public
 */
export interface OwnedReferralCodeEligibility {
  eligible: boolean
  /**
   * Executed notional the address must reach, as a decimal string in the
   * backend's reporting currency. Absent when the backend does not disclose it.
   */
  requiredNotional?: string
  /** The address's executed notional so far, in the same units as `requiredNotional`. */
  currentNotional?: string
}

/**
 * What the one pending onboarding signature would commit for an address. A
 * present field is carried by the step; an absent field is not part of it.
 * @public
 */
export interface OnboardingRequirement {
  /** Terms version the step accepts; absent when the address already accepted the current version. */
  termsVersion?: string
  /** Normalized code the step attaches; absent when the step attaches none. */
  referralCode?: string
}

/**
 * Address-scoped onboarding and internal-referral state, served by
 * `GET /v1/perps/meta/referral?address=`.
 *
 * An address the backend holds no record for still resolves to a well-formed
 * payload: `termsAccepted` is `false` and every optional state field is absent.
 * @public
 */
export interface ReferralStatus {
  address: Address
  /** Backend-owned version identifier for the current terms. */
  termsVersion: string
  termsAccepted: boolean
  attachedCode?: AttachedReferralCode
  ownedCode?: OwnedReferralCode
  ownedCodeEligibility: OwnedReferralCodeEligibility
  /** Verdict for the request's candidate code; absent when the request passed none. */
  candidate?: ReferralCodeValidation
  /**
   * The one onboarding step to sign next; absent when the backend requires no
   * consent from this address.
   */
  onboarding?: OnboardingRequirement
}

/**
 * One address attached to the queried address's owned internal referral code.
 * @public
 */
export interface ReferralActivityItem {
  address: Address
  /** Unix epoch milliseconds the attachment was recorded. */
  attachedAt: number
  /**
   * Executed notional recorded against this attachment, as a decimal string in
   * the backend's reporting currency.
   */
  notional: string
}

/**
 * Paginated attachment records for an address's owned internal referral code,
 * served by `GET /v1/perps/meta/referral/activity?address=`.
 *
 * An address that owns no code resolves to `items: []` with `hasMore: false`
 * and no cursor.
 * @public
 */
export interface ReferralActivityResponse {
  items: ReferralActivityItem[]
  pagination: Pagination
}

/**
 * Params for an {@link "./enums.js".ActionType.META_ONBOARD} action: the terms
 * version to accept and the candidate internal referral code to attach.
 *
 * Both fields are requests, not commitments. The backend decides what the step
 * it returns actually carries, and returns no step when it needs no consent.
 *
 * Provider-independent: sent with the {@link "./metaProvider.js".META_PROVIDER}
 * sentinel in the transport `provider` field.
 * @public
 */
export interface OnboardParams {
  /** Terms-of-Service version being accepted; backend-owned, relayed verbatim. */
  termsVersion?: string
  /** Candidate code as the client captured it; the backend normalizes it. */
  referralCode?: string
}

/**
 * EIP-712 message body for an `Onboard`. Field order matches
 * {@link onboardTypeFields}.
 *
 * Every mutable field is bound into the digest, so a term the signature does
 * not commit is carried as the empty string rather than dropped.
 * @public
 */
export interface OnboardMessage {
  /** Human-readable action, e.g. `"Accept LI.FI Perps Terms of Service v3"`. */
  action: string
  account: Address
  /** Terms version accepted, or `''` when the signature accepts no terms. */
  termsVersion: string
  /** Normalized code attached, or `''` when the signature attaches none. */
  referralCode: string
  /** Replay-protection nonce as a decimal string (uint256). */
  nonce: string
  /** Unix timestamp in milliseconds after which the signature is stale. */
  deadline: number
}

/**
 * EIP-712 type member list for the `Onboard` primary type. Field order is part
 * of the signed digest and must match the backend's encoder.
 * @public
 */
export const onboardTypeFields: readonly TypedDataParameter[] = [
  { name: 'action', type: 'string' },
  { name: 'account', type: 'address' },
  { name: 'termsVersion', type: 'string' },
  { name: 'referralCode', type: 'string' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]

/**
 * EIP-712 typed data for a composite onboarding consent, as returned by
 * `createAction` and signed client-side. `primaryType` is always `'Onboard'`.
 * @public
 */
export interface OnboardTypedData extends PerpsTypedData {
  primaryType: 'Onboard'
  types: {
    Onboard: readonly TypedDataParameter[]
  } & PerpsTypedData['types']
  message: OnboardMessage
}

/**
 * Params for an
 * {@link "./enums.js".ActionType.META_CREATE_REFERRAL_CODE} action.
 *
 * Provider-independent: sent with the {@link "./metaProvider.js".META_PROVIDER}
 * sentinel in the transport `provider` field.
 * @public
 */
export interface CreateReferralCodeParams {
  /** Desired code; omit to let the backend generate one. */
  code?: string
}

/**
 * EIP-712 message body for a `CreateReferralCode`. Field order matches
 * {@link createReferralCodeTypeFields}.
 * @public
 */
export interface CreateReferralCodeMessage {
  /** Human-readable action, e.g. `"Create LI.FI Perps referral code ABC123"`. */
  action: string
  account: Address
  /** Normalized code the signature reserves. */
  code: string
  /** Replay-protection nonce as a decimal string (uint256). */
  nonce: string
  /** Unix timestamp in milliseconds after which the signature is stale. */
  deadline: number
}

/**
 * EIP-712 type member list for the `CreateReferralCode` primary type. Field
 * order is part of the signed digest and must match the backend's encoder.
 * @public
 */
export const createReferralCodeTypeFields: readonly TypedDataParameter[] = [
  { name: 'action', type: 'string' },
  { name: 'account', type: 'address' },
  { name: 'code', type: 'string' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]

/**
 * EIP-712 typed data for reserving an owned internal referral code, as
 * returned by `createAction` and signed client-side. `primaryType` is always
 * `'CreateReferralCode'`.
 * @public
 */
export interface CreateReferralCodeTypedData extends PerpsTypedData {
  primaryType: 'CreateReferralCode'
  types: {
    CreateReferralCode: readonly TypedDataParameter[]
  } & PerpsTypedData['types']
  message: CreateReferralCodeMessage
}
