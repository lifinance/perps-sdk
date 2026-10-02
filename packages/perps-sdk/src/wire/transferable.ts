import type { DecimalString } from '@lifi/perps-types'
import { requireDecimal } from '../decimal/requireDecimal.js'

/**
 * The part of `units` that a venue-wide free figure releases: never below
 * zero, never above the units held. `Balance.transferable` on every provider
 * is this clamp over the venue's own free-margin or unlocked-balance figure.
 *
 * @param venueFigure - The venue's free figure for the category, which can
 *   exceed `units` or fall below zero.
 * @param units - Units held in the category, the upper bound of the clamp.
 * @throws {PerpsError} `ValidationError` when either input is not a
 *   {@link DecimalString}, naming the field.
 * @public
 */
export function calculateTransferable(
  venueFigure: DecimalString,
  units: DecimalString
): DecimalString {
  const figure = requireDecimal(venueFigure, 'venueFigure')
  const held = requireDecimal(units, 'units')
  if (figure.lt(0)) {
    return '0'
  }
  return (figure.gt(held) ? held : figure).toFixed()
}
