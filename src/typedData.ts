import type { TypedData, SignedTypedData } from '@lifi/types'
import type { Address, Hex, TypedDataDomain, TypedDataParameter } from 'viem'

export type PerpsTypedDataPrimaryType =
  | 'HyperliquidTransaction:ApproveAgent'
  | 'HyperliquidTransaction:ApproveBuilderFee'
  | 'HyperliquidTransaction:UserSetAbstraction'
  | 'Agent'

export type PerpsTypedData = Omit<TypedData, 'primaryType'> & {
  primaryType: PerpsTypedDataPrimaryType
}

export type PerpsSignedTypedData = Omit<SignedTypedData, 'primaryType'> & {
  primaryType: PerpsTypedDataPrimaryType
}

// Re-export viem primitives used across perps types
export type { Address, Hex, TypedDataDomain, TypedDataParameter }
