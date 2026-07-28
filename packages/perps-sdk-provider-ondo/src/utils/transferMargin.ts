/**
 * Ondo publishes no transfer-margin requirement: the venue is cross-margined
 * only and users cannot add or remove margin from individual positions.
 * Getting margin out is an account-level withdrawal, which the venue reports
 * directly.
 *
 * @returns `undefined` — no per-position margin transfer exists to bound.
 * @see https://docs.ondoperps.xyz/positions-balances
 * @public
 */
export function removableMargin(): undefined {
  return undefined
}
