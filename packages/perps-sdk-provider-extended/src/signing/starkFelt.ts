import type { Hex } from '@lifi/perps-types'

const STARK_FIELD_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n

/** An integer as a bigint, a decimal string, or a `0x` hex string. @internal */
export type StarkFeltInput = string | bigint

/** @internal */
export const toFelt = (value: StarkFeltInput): bigint =>
  ((BigInt(value) % STARK_FIELD_PRIME) + STARK_FIELD_PRIME) % STARK_FIELD_PRIME

/** @internal */
export const toStarkHex = (value: StarkFeltInput): Hex =>
  `0x${BigInt(value).toString(16)}`
