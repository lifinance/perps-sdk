import { PerpsError } from '@lifi/perps-sdk'
import { type Asset, PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'

/**
 * Resolve a wire `assetId` against the backend's enriched asset list. The list
 * is the source of truth for every tradable market, so an id the venue
 * references but the backend does not know is a hard error — never a silent
 * fallback to an unenriched stand-in.
 */
export const requireAsset = (
  byAssetId: Map<string, Asset>,
  assetId: string
): Asset => {
  const asset = byAssetId.get(assetId)
  if (!asset) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `No Hyperliquid asset found for assetId '${assetId}'`
    )
    err.tool = PROVIDER_KEY
    throw err
  }
  return asset
}
