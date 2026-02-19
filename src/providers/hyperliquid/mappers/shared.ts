/**
 * Look up an asset ID by symbol, throwing if the symbol is unknown.
 * Asset ID 0 is a valid Hyperliquid asset (BTC-PERP), so a fallback
 * to 0 would silently corrupt data.
 */
export const resolveAssetIdFromLookup = (
  lookup: Map<string, number>,
  symbol: string
): number => {
  const id = lookup.get(symbol)
  if (id === undefined) {
    throw new Error(`Unknown asset symbol: ${symbol}`)
  }
  return id
}
