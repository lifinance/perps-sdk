import type { Address, Hex } from './primitives.js'

export interface TypedDataDomain {
  name?: string
  version?: string
  chainId?: number
  verifyingContract?: Address
  salt?: Hex
}

export interface TypedDataParameter {
  name: string
  type: string
}

export type PerpsPrimaryType = string

export type PerpsTypedData = {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: PerpsPrimaryType
  message: Record<string, any>
}

export type PerpsSignedTypedData = PerpsTypedData & {
  signature: Hex
}
