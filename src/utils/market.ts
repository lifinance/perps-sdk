/**
 * Market symbol parsing utilities.
 */

/**
 * Derive the venue prefix from a colon-delimited market key.
 * "xyz:TSLA" -> "xyz", "ETH" -> ""
 */
export function getVenue(key: string): string {
  const colonIdx = key.indexOf(':')
  return colonIdx >= 0 ? key.slice(0, colonIdx) : ''
}

/**
 * Derive the asset (right side) from a colon-delimited market key.
 * "xyz:TSLA" -> "TSLA", "ETH" -> "ETH"
 */
export function getAsset(key: string): string {
  const colonIdx = key.indexOf(':')
  return colonIdx >= 0 ? key.slice(colonIdx + 1) : key
}

/**
 * Derive the quote asset for a market symbol from its venue prefix.
 *
 * @param symbol - Market symbol (e.g. "kETH:ETH" or "ETH")
 * @param venueMap - Map of venue prefix to quote asset (e.g. Map([["k", "USDT"]]))
 * @returns Quote asset string, defaults to "USDC"
 */
export function getQuoteAsset(
  symbol: string,
  venueMap: Map<string, string>
): string {
  return venueMap.get(getVenue(symbol)) ?? 'USDC'
}
