import type { Hex, TypedDataDomain, TypedDataParameter } from 'viem'

export type PerpsPrimaryType = string

export type PerpsTypedData = {
  domain: TypedDataDomain
  types: Record<string, readonly TypedDataParameter[]>
  primaryType: PerpsPrimaryType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: Record<string, any>
}

export type PerpsSignedTypedData = PerpsTypedData & {
  signature: Hex
}
