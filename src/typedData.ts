import type { TypedData, SignedTypedData } from '@lifi/types'
import type { Address, Hex, TypedDataDomain, TypedDataParameter } from 'viem'

export type PerpsTypedData = Omit<TypedData, 'primaryType'> & {
  primaryType: string
}

export type PerpsSignedTypedData = Omit<SignedTypedData, 'primaryType'> & {
  primaryType: string
}

// Re-export viem primitives used across perps types
export type { Address, Hex, TypedDataDomain, TypedDataParameter }
