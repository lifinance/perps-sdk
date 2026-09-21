/**
 * Trailing hex characters a Lighter placeholder `tx_hash` leaves zero. Lighter
 * reports a 40-byte hash on every fill and transfer row, and a row that settled
 * no transaction carries a sequence pair in the leading 16 bytes and zero in
 * the remaining 24. A settled row fills all 40 bytes.
 */
const PLACEHOLDER_ZERO_SUFFIX_LENGTH = 48

const ALL_ZERO = /^0+$/

/**
 * Report whether a Lighter `tx_hash` is the placeholder the venue sends for a
 * row that settled no transaction. Such a row resolves to no explorer link.
 *
 * @internal
 */
export const isPlaceholderTxHash = (txHash: string | undefined): boolean =>
  txHash !== undefined &&
  txHash.length > PLACEHOLDER_ZERO_SUFFIX_LENGTH &&
  ALL_ZERO.test(txHash.slice(-PLACEHOLDER_ZERO_SUFFIX_LENGTH))
