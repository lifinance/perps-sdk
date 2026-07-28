import type { Address, Hex } from './primitives.js'

/**
 * EIP-712 domain fields used to identify a signing domain. `chainId` is the
 * numeric EVM chain id when present.
 *
 * @public
 */
export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: Address
  salt?: Hex
}

/** One named field in an EIP-712 primary type definition. @public */
export interface TypedDataParameter {
  name: string
  type: string
}

/** Primary-type name used by a perps EIP-712 payload. @public */
export type PerpsPrimaryType = string

/**
 * Provider-neutral EIP-712 payload passed between backend and SDK. `message`
 * intentionally remains open because each action defines its own fields.
 *
 * @public
 */
export type PerpsTypedData = {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: PerpsPrimaryType
  message: Record<string, any>
}

/** EIP-712 payload accompanied by its client-produced signature. @public */
export type PerpsSignedTypedData = PerpsTypedData & {
  signature: Hex
}
