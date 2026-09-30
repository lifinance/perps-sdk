import Big from 'big.js'

/**
 * The part of `units` that a venue-wide free figure releases: never below
 * zero and never above the units held.
 *
 * @internal
 */
export const transferableWithin = (venueFigure: Big, units: Big): Big => {
  if (venueFigure.lt(0)) {
    return new Big(0)
  }
  return venueFigure.gt(units) ? units : venueFigure
}
