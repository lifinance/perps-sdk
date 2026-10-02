import { PerpsError, type SDKRequestOptions } from '@lifi/perps-sdk'
import {
  MarginMode,
  type MarketRef,
  type MarketSettings,
  PerpsErrorCode,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import { hlInfoOptions } from '../utils/infoClient.js'
import { fetchActiveAssetData } from './activeAssetData.js'
import { requireAccountExists } from './getAccountExists.js'

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
 * @throws {PerpsError} `ValidationError` for a spot market; `SDKError` when
 *   the response carries no positive leverage; any other `PerpsError` on
 *   Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getMarketSettings = async (
  context: HyperliquidContext,
  params: GetMarketSettingsParams,
  options?: SDKRequestOptions
): Promise<MarketSettings> => {
  if (params.market.categoryId === SPOT_MARKET_ID) {
    const error = new PerpsError(
      PerpsErrorCode.ValidationError,
      `Hyperliquid market '${params.market.marketId}' is a spot market and carries no leverage setting`
    )
    error.tool = PROVIDER_KEY
    throw error
  }
  await requireAccountExists(
    context.apiUrl,
    params.address,
    hlInfoOptions(context.client, options)
  )
  const data = await fetchActiveAssetData(
    context,
    params.address,
    params.market.marketId,
    options
  )
  const leverage = data.leverage
  if (!leverage || !(leverage.value > 0)) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      `Hyperliquid returned no leverage for market '${params.market.marketId}'`
    )
    error.tool = PROVIDER_KEY
    throw error
  }
  return {
    marginMode:
      leverage.type === 'isolated' ? MarginMode.ISOLATED : MarginMode.CROSS,
    leverage: leverage.value,
  }
}
