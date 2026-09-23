import type { Market, MarketContext } from '@lifi/perps-types'
import type Big from 'big.js'
import { toRequiredBig } from './decimal.js'

/**
 * Unit prices keyed by spot base `Asset.id` (the venue `asset_id`), read from
 * each spot market's `markPrice`. A market without a context row or with a
 * non-positive mark adds no entry; when several spot markets share a base
 * asset, the first priced one in `markets` order wins.
 *
 * @throws {PerpsError} `SDKError` when a context row carries a non-decimal mark.
 */
export const spotPriceByAssetId = (
  markets: readonly Market[],
  spotCategoryId: string,
  contexts: readonly MarketContext[]
): Map<string, Big> => {
  const markByMarketId = new Map(contexts.map((c) => [c.marketId, c.markPrice]))
  const priceByAssetId = new Map<string, Big>()
  for (const market of markets) {
    const mark = markByMarketId.get(market.id)
    if (
      market.categoryId !== spotCategoryId ||
      mark === undefined ||
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
