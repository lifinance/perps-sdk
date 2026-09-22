import {
  getMarketRegistry,
  PerpsError,
  type SDKRequestOptions,
  toAssetDisplay,
} from '@lifi/perps-sdk'
import type { AvailableToTrade } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import { fetchActiveAssetData } from './activeAssetData.js'

/**
 * Parameters for {@link getAvailableToTrade}.
 *
 * @public
 */
export interface GetAvailableToTradeParams {
  address: Address
  marketId: string
}

/**
 * The amounts the account can still buy and sell on one perps market, read
 * from `activeAssetData`. The amounts are denominated in the market's margin
 * asset: USDC on the main dex, and the dex margin asset on a builder-deployed
 * dex. Resolves `undefined` for a spot market, which carries no such state.
 *
 * @throws {PerpsError} On an unknown market, an `availableToTrade` payload
 *   that is not a buy/sell pair, Hyperliquid REST error, network, or parsing
 *   failures.
 * @public
 */
export const getAvailableToTrade = async (
  context: HyperliquidContext,
  params: GetAvailableToTradeParams,
  options?: SDKRequestOptions
): Promise<AvailableToTrade | undefined> => {
  const registry = getMarketRegistry(context.client, PROVIDER_KEY)
  await registry.sync()
  const market = registry.require(params.marketId)
  if (market.categoryId === SPOT_MARKET_ID) {
    return undefined
  }
  const data = await fetchActiveAssetData(
    context,
    params.address,
    params.marketId,
    options
  )
  // The wire type states the pair; nothing verifies the response, so read it
  // as a plain list to keep the length check in reach of the type checker.
  const amounts: readonly string[] = data.availableToTrade
  if (amounts.length !== 2) {
    const err = new PerpsError(
      PerpsErrorCode.ValidationError,
      `Hyperliquid returned ${amounts.length} availableToTrade amounts for market '${params.marketId}'. Expected a buy amount and a sell amount.`
    )
    err.tool = PROVIDER_KEY
    throw err
  }
  // Hyperliquid orders the pair buy-side first, sell-side second.
  const [buy, sell] = amounts
  return {
    providerId: market.providerId,
    marketId: market.id,
    asset: toAssetDisplay(market.quoteAsset),
    buy,
    sell,
  }
}
