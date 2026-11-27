import Big from 'big.js'

/**
 * Scoped big.js constructor with 40 decimal places for division, so the
 * shared global `Big.DP` and `Big.RM` stay untouched.
 */
export const DivBig = Big()
DivBig.DP = 40

/**
 * As `DivBig`, but truncating, so a derived amount never rounds up past the
 * exact quotient.
 */
export const TruncBig = Big()
TruncBig.DP = 40
TruncBig.RM = Big.roundDown

/**
 * As `DivBig`, but rounding away from zero, so a derived amount never falls
 * below the exact quotient.
 */
export const RoundUpBig = Big()
RoundUpBig.DP = 40
RoundUpBig.RM = Big.roundUp
