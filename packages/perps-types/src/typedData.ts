import type { Address, Hex, TypedDataDomain, TypedDataParameter } from 'viem'

/**
 * EIP-712 primaryType value. Provider-agnostic at the types layer — each
 * provider package exports its own narrow union of literals (e.g.
 * `HlPrimaryType` in `@lifi/perps-sdk-provider-hyperliquid`); consumers
 * that need to validate against a closed set should import the
 * provider-specific union directly.
 */
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

// Re-export viem primitives used across perps types
export type { Address, Hex, TypedDataDomain, TypedDataParameter }
