/**
 * Hex-prefixed EVM address string. The type validates only the `0x` prefix;
 * checksum and byte-length validation remain runtime/provider concerns.
 *
 * @public
 */
export type Address = `0x${string}`

/**
 * Hex-prefixed byte string used for hashes, signatures, salts, and other EVM
 * wire values. The type does not constrain byte length.
 *
 * @public
 */
export type Hex = `0x${string}`
