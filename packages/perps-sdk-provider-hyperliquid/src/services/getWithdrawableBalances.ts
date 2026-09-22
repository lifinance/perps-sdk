import {
  getMarketRegistry,
  PerpsError,
  type ProviderGetWithdrawableBalancesParams,
  type ProviderWithdrawableBalance,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { MAIN_MARKET_ID, PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlSpotClearinghouseState,
} from '../types/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { hyperliquidWithdrawableBalances } from '../utils/withdrawableBalances.js'

/**
 * Parameters for {@link getWithdrawableBalances}.
 *
 * @public
 */
export type GetWithdrawableBalancesParams =
  ProviderGetWithdrawableBalancesParams

/**
 * The `(asset, route)` pairs `params.address` can withdraw from Hyperliquid,
 * read from the venue's own `withdrawable` and spot `total`/`hold` figures.
 *
 * Only the main perps dex is read: a withdrawal to L1 draws on that account,
 * and a sub-dex balance reaches it through a transfer first.
 *
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing
 * failures, and `SDKError` when the market registry carries no main perps
 * market to name the quote asset.
 * @public
 */
export const getWithdrawableBalances = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetWithdrawableBalancesParams,
  options?: SDKRequestOptions
): Promise<ProviderWithdrawableBalance[]> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  const infoOpts = hlInfoOptions(client, options)

  const [markets, abstraction, state, spotState] = await Promise.all([
    registry.sync(),
    infoRequest<HlAbstractionMode | null>(
      apiUrl,
      { type: 'userAbstraction', user: params.address },
      infoOpts
    ),
    infoRequest<HlClearinghouseState>(
      apiUrl,
      { type: 'clearinghouseState', user: params.address },
      infoOpts
    ),
    infoRequest<HlSpotClearinghouseState>(
      apiUrl,
      { type: 'spotClearinghouseState', user: params.address },
      infoOpts
    ),
  ])

  const quoteAsset = markets.find(
    (market) => market.categoryId === MAIN_MARKET_ID
  )?.quoteAsset
  if (quoteAsset === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid market registry carries no '${MAIN_MARKET_ID}' market to name the withdrawal quote asset`
    )
  }

  return hyperliquidWithdrawableBalances(
    abstraction,
    state,
    spotState,
    quoteAsset.id
  )
}
