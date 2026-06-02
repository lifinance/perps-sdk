import type { Address, Hex } from './primitives.js'

/** @public */
export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: Address
  salt?: Hex
}

/** @public */
export interface TypedDataParameter {
  name: string
  type: string
}

/** @public */
export type PerpsPrimaryType = string

/** @public */
export type PerpsTypedData = {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: PerpsPrimaryType
  message: Record<string, any>
}

/** @public */
export type PerpsSignedTypedData = PerpsTypedData & {
  signature: Hex
}
