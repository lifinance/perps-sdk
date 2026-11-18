import type { Hex } from '@lifi/perps-types'

/** @internal */
export const toStarkHex = (value: string | bigint): Hex =>
  `0x${BigInt(value).toString(16)}`

/** Decimal form for the signer's integer arguments; keeps the sign of an i64. @internal */
export const toDecimal = (value: string | bigint): string =>
  BigInt(value).toString(10)
