// biome-ignore-all lint/performance/noBarrelFile: single re-export entry point
// for the package's utility surface. Internal modules import per-file paths
// (e.g. `./assetId.js`, `./mapFill.js`) directly.

export { assetIsSpot, calculateAssetId, getProviderIndex } from './assetId.js'
export type { AssetEnrichmentMaps, AssetWithMeta } from './assetLookups.js'
export {
  buildAssetEnrichmentMaps,
  buildAssetMarketLookup,
  fetchAllPerpAssetsRaw,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from './assetLookups.js'
export { deriveMarket } from './deriveMarket.js'
export type { InfoRequestOptions } from './infoClient.js'
export { infoRequest } from './infoClient.js'
export {
  calculateLiquidationPrice,
  calculateMaintenanceMarginRate,
} from './liquidation.js'
export { mapFundingActivity, mapLedgerEntry } from './mapActivity.js'
export { mapAsset } from './mapAsset.js'
export { classifyFillFromPosition, mapFill } from './mapFill.js'
export {
  isTriggerType,
  mapOpenOrder,
  mapOrder,
  mapOrderType,
  mapStatusReason,
  mapTriggerOrder,
} from './mapOrder.js'
export { mapPosition } from './mapPosition.js'
export {
  formatOrderPrice,
  formatOrderSize,
  getMaxPriceDecimals,
} from './orderFormatting.js'
export type {
  HlSpotAssetCtx,
  HlSpotMeta,
  HlSpotMetaAndAssetCtxs,
  HlSpotToken,
  HlSpotUniverseEntry,
  SpotPairInfo,
} from './spot.js'
export {
  buildSpotPairNameLookup,
  buildSpotTokenIdLookup,
  buildSpotTokenLookup,
  getSpotAssetCtxs,
  getSpotPairs,
  purrSpotOverride,
  resolveSpotPair,
  spotPairAssetId,
} from './spot.js'
export type { ProviderMarket } from './subdexes.js'
export {
  buildMarketQuoteAssetMap,
  getProviderMarkets,
  getSupportedSubDexes,
  perpsDisplaySymbol,
  toProviderMarketId,
} from './subdexes.js'
