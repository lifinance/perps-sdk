import { FillClassification } from '@lifi/perps-types'

/**
 * Classify a perpetual fill into the Open/Close/Increase/Reduce/Switch
 * taxonomy from `FillClassification`.
 *
 * @param startPosition Signed position held BEFORE this fill (`> 0` long,
 *   `< 0` short, `0` flat).
 * @param side Hyperliquid-style: `'B'` for buy, anything else for sell.
 * @param sz Unsigned fill size, parsed with `parseFloat`.
 * @public
 */
export function classifyFillFromPosition(
  startPosition: string,
  side: string,
  sz: string
): FillClassification {
  const start = parseFloat(startPosition)
  const delta = side === 'B' ? parseFloat(sz) : -parseFloat(sz)
  const end = start + delta

  if (start === 0) {
    return end > 0
      ? FillClassification.OPENED_LONG
      : FillClassification.OPENED_SHORT
  }

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
