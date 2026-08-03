import {
  getMarketRegistry,
  PerpsError,
  type SDKRequestOptions,
  toMarketDisplay,
} from '@lifi/perps-sdk'
import {
  OrderSide,
  PerpsErrorCode,
  type TwapOrder,
  TwapOrderStatus,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

interface HlTwapState {
  coin: string
  executedNtl: string
  executedSz: string
  minutes: number
  side: 'A' | 'B'
  sz: string
  timestamp: number
}

interface HlTwapHistoryEntry {
  state: HlTwapState
  status: { status: string; description?: string }
  time: number
  twapId?: number
}

/** Parameters for {@link getRunningTwaps}. @public */
export interface GetRunningTwapsParams {
  address: Address
  marketId?: string
}

/** Fetch the user's active TWAP states from Hyperliquid's `twapHistory` info request. */
export const getRunningTwaps = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetRunningTwapsParams,
  options?: SDKRequestOptions
): Promise<TwapOrder[]> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  const [history] = await Promise.all([
    infoRequest<HlTwapHistoryEntry[]>(
      apiUrl,
      { type: 'twapHistory', user: params.address },
      hlInfoOptions(client, options)
    ),
    registry.sync(),
  ])

  return history
    .filter(
      (entry) =>
        entry.status.status === 'activated' &&
        (params.marketId === undefined || entry.state.coin === params.marketId)
    )
    .map((entry) => {
      if (entry.twapId === undefined) {
        throw new PerpsError(
          PerpsErrorCode.ThirdPartyError,
          'Hyperliquid returned an active TWAP without a twapId.'
        )
      }
      const filledSize = new Big(entry.state.executedSz)
      return {
        twapId: String(entry.twapId),
        market: toMarketDisplay(registry.require(entry.state.coin)),
        side: entry.state.side === 'B' ? OrderSide.BUY : OrderSide.SELL,
        totalSize: entry.state.sz,
        filledSize: entry.state.executedSz,
        ...(filledSize.eq(0)
          ? {}
          : {
              avgFillPrice: new Big(entry.state.executedNtl)
                .div(filledSize)
                .toString(),
            }),
        startedAt: new Date(entry.state.timestamp).toISOString(),
        durationSeconds: entry.state.minutes * 60,
        status: TwapOrderStatus.RUNNING,
      }
    })
}
