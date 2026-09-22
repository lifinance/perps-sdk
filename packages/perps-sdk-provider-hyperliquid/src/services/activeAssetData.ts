import type { SDKRequestOptions } from '@lifi/perps-sdk'
import type { Address } from 'viem'
import type { HyperliquidContext } from '../context.js'
import type { HlActiveAssetData } from '../types/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/**
 * The venue's per-account, per-market state for one perps market: margin
 * mode, leverage, maximum sizes and the amounts still tradable on each side.
 * Present whether or not a position is open.
 *
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 */
export const fetchActiveAssetData = (
  { client, apiUrl }: HyperliquidContext,
  address: Address,
  marketId: string,
  options?: SDKRequestOptions
): Promise<HlActiveAssetData> =>
  infoRequest<HlActiveAssetData>(
    apiUrl,
    { type: 'activeAssetData', user: address, coin: marketId },
    hlInfoOptions(client, options)
  )
