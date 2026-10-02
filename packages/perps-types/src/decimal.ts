/**
 * Plain decimal string: optional `-`, digits, optional fraction. No grouping,
 * exponent, currency sign or whitespace; matches {@link DECIMAL_PATTERN}. Build
 * it with an SDK `snap*`/`calculate*` helper or a provider, not `.toString()`.
 *
 * @public
 */
export type DecimalString = string

/**
 * The single spelling rule for a {@link DecimalString}. It stays byte-identical
 * to the pattern `lifi-perps-backend` matches every stored decimal against, so
 * one amount has exactly one spelling in all three repositories.
 *
 * @public
 */
export const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
