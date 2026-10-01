import type Big from 'big.js'

/** The larger of two Big values, as `Math.max` for numbers. */
export const maxOf = (a: Big, b: Big): Big => (a.gt(b) ? a : b)

/** The smaller of two Big values, as `Math.min` for numbers. */
export const minOf = (a: Big, b: Big): Big => (a.lt(b) ? a : b)
