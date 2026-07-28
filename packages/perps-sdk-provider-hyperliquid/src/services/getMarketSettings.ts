import type { SDKRequestOptions } from '@lifi/perps-sdk'
import {
  MarginMode,
  type MarketRef,
  type MarketSettings,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { SPOT_MARKET_ID } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type { HlActiveAssetData } from '../types/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * Parameters for {@link getMarketSettings}.
 *
 * @public
 */
export interface GetMarketSettingsParams {
  address: Address
  market: MarketRef
}

/**
 * The user's venue-stored margin mode and leverage for one perps market,
 * read from `activeAssetData` — present whether or not a position is open.
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getMarketSettings = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetMarketSettingsParams,
  options?: SDKRequestOptions
): Promise<MarketSettings | undefined> => {
  // Spot markets carry no leverage state on the venue.
  if (params.market.categoryId === SPOT_MARKET_ID) {
    return undefined
  }
  const data = await infoRequest<HlActiveAssetData>(
    apiUrl,
    {
      type: 'activeAssetData',
      user: params.address,
      coin: params.market.marketId,
    },
    hlInfoOptions(client, options)
  )
  const leverage = data.leverage
  if (!leverage) {
    return undefined
  }
  return {
    marginMode:
      leverage.type === 'isolated' ? MarginMode.ISOLATED : MarginMode.CROSS,
    leverage: leverage.value,
  }
}
