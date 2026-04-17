import type { Address, Hex, TypedDataDomain, TypedDataParameter } from 'viem'
import type { HlPrimaryType } from './providers/hyperliquid/types.js'

/**
 * All known EIP-712 primaryType values across supported providers.
 * Extend this union when adding a new EIP-712 provider.
 */
export type PerpsPrimaryType = HlPrimaryType

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

// Re-export viem primitives used across perps types
export type { Address, Hex, TypedDataDomain, TypedDataParameter }
