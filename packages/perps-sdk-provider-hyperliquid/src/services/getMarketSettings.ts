import type { SDKRequestOptions } from '@lifi/perps-sdk'
import { MarginMode, type MarketSettings } from '@lifi/perps-types'
import type { Address } from 'viem'
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
  marketId: string
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
  // Spot ids ('@N', 'PURR/USDC') carry no leverage state on the venue.
  if (params.marketId.includes('@') || params.marketId.includes('/')) {
    return undefined
  }
  const data = await infoRequest<HlActiveAssetData>(
    apiUrl,
    { type: 'activeAssetData', user: params.address, coin: params.marketId },
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
