import type { Market, MarketContext } from '@lifi/perps-types'
import type Big from 'big.js'
import { toRequiredBig } from './decimal.js'

/**
 * Unit prices keyed by spot base `Asset.id` (the venue `asset_id`), read from
 * each spot market's `markPrice` for the base assets in `assetIds` only. A
 * market without a context row or with a non-positive mark adds no entry; when
 * several spot markets share a base asset, the first priced one in `markets`
 * order wins. The mark is read as a USD price; `quoteAsset` is not checked.
 *
 * @throws {PerpsError} `SDKError` when a context row for a requested asset
 * carries a non-decimal mark.
 */
export const spotPriceByAssetId = (
  markets: readonly Market[],
  spotCategoryId: string,
  contexts: readonly MarketContext[],
  assetIds: ReadonlySet<string>
): Map<string, Big> => {
  const markByMarketId = new Map(contexts.map((c) => [c.marketId, c.markPrice]))
  const priceByAssetId = new Map<string, Big>()
  for (const market of markets) {
    const mark = markByMarketId.get(market.id)
    if (
      market.categoryId !== spotCategoryId ||
      mark === undefined ||
      !assetIds.has(market.baseAsset.id) ||
      priceByAssetId.has(market.baseAsset.id)
    ) {
      continue
    }
    const price = toRequiredBig(mark, 'markPrice')
    if (price.gt(0)) {
      priceByAssetId.set(market.baseAsset.id, price)
    }
  }
  return priceByAssetId
}
