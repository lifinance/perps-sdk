import { FillClassification } from '../../enums.js'

/**
 * Classify a perpetual fill into the Open/Close/Increase/Reduce/Switch
 * taxonomy from `FillClassification`.
 *
 * Inputs are intentionally provider-agnostic so this helper can be shared
 * across providers that surface enough information per fill:
 * - `startPosition`: signed quantity held in the market BEFORE this fill
 *   (`> 0` long, `< 0` short, `0` flat).
 * - `side`: Hyperliquid-style `'B'` for buy / anything else for sell. The
 *   `'B'`/`'A'` literal predates this extraction and is preserved so that
 *   the Hyperliquid path stays byte-identical.
 * - `sz`: unsigned fill size, parsed with `parseFloat`.
 *
 * Returns the classification matching the (start, end) sign transition,
 * where `end = start + signedDelta`. Pure / deterministic.
 */
export function classifyFillFromPosition(
  startPosition: string,
  side: string,
  sz: string
): FillClassification {
  const start = parseFloat(startPosition)
  const delta = side === 'B' ? parseFloat(sz) : -parseFloat(sz)
  const end = start + delta

  // Position was flat → opening
  if (start === 0) {
    return end > 0
      ? FillClassification.OPENED_LONG
      : FillClassification.OPENED_SHORT
  }

  // Position was long
  if (start > 0) {
    if (end === 0) {
      return FillClassification.CLOSED_LONG
    }
    if (end < 0) {
      return FillClassification.SWITCHED_SHORT
    }
    if (end > start) {
      return FillClassification.INCREASED_LONG
    }
    return FillClassification.REDUCED_LONG
  }

  // Position was short (start < 0)
  if (end === 0) {
    return FillClassification.CLOSED_SHORT
  }
  if (end > 0) {
    return FillClassification.SWITCHED_LONG
  }
  if (end < start) {
    return FillClassification.INCREASED_SHORT
  }
  return FillClassification.REDUCED_SHORT
}
