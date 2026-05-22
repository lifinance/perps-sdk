import {
  PerpsError,
  type PerpsProvider,
  type PerpsSDKClient,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetAssetParams,
  type ProviderGetFillsParams,
  type ProviderGetOhlcvParams,
  type ProviderGetOrderbookParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetPricesParams,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import {
  type AccountConfig,
  type AccountConfigSetting,
  type AccountResponse,
  type AccountSummary,
  type ActivitiesResponse,
  type Asset,
  type AssetsResponse,
  type FillsResponse,
  type OhlcvResponse,
  type Order,
  type OrderbookResponse,
  type OrdersResponse,
  PerpsErrorCode,
  type Position,
  type PositionsResponse,
  type PricesResponse,
  type ProviderOption,
  type ProviderSetup,
} from '@lifi/perps-types'
import { projectHyperliquidConfigSettings } from './accountConfig.js'
import { summarizeHyperliquidAccount } from './accountSummary.js'
import { DEFAULT_HYPERLIQUID_API_URL, PROVIDER_KEY } from './constants.js'
import { getAccount } from './services/getAccount.js'
import { getActivity } from './services/getActivity.js'
import { getAsset } from './services/getAsset.js'
import { getAssets } from './services/getAssets.js'
import { getFills } from './services/getFills.js'
import { getOhlcv } from './services/getOhlcv.js'
import { getOrder } from './services/getOrder.js'
import { getOrderbook } from './services/getOrderbook.js'
import { getOrders } from './services/getOrders.js'
import { getPositions } from './services/getPositions.js'
import { getPrices } from './services/getPrices.js'

export interface HyperliquidProviderOptions {
  /**
   * Base URL for the Hyperliquid REST surface. Defaults to
   * `https://api.hyperliquid.xyz`. Override for testnet
   * (`https://api.hyperliquid-testnet.xyz`) or for routing through a
   * private mirror.
   */
  apiUrl?: string
}

/**
 * Factory for the Hyperliquid {@link PerpsProvider} plugin.
 *
 * The returned plugin reads exclusively from `${apiUrl}/info` — there is no
 * fallback to the LI.FI backend by design. Pass to `createPerpsClient({
 * providers: [hyperliquidProvider()] })` and look up via
 * `client.getProvider('hyperliquid')`.
 */
export function hyperliquidProvider(
  options: HyperliquidProviderOptions = {}
): PerpsProvider {
  const apiUrl = options.apiUrl ?? DEFAULT_HYPERLIQUID_API_URL

  return {
    type: PROVIDER_KEY,

    getAccount: (
      _client: PerpsSDKClient,
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> =>
      getAccount(apiUrl, { address: params.address }, { signal: opts?.signal }),

    getPositions: (
      _client: PerpsSDKClient,
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> =>
      getPositions(
        apiUrl,
        {
          address: params.address,
          symbol: params.symbol,
          limit: params.limit,
        },
        { signal: opts?.signal }
      ),

    getOrders: (
      _client: PerpsSDKClient,
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> =>
      getOrders(
        apiUrl,
        {
          address: params.address,
          symbol: params.symbol,
          limit: params.limit,
        },
        { signal: opts?.signal }
      ),

    getOrder: (
      _client: PerpsSDKClient,
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> =>
      getOrder(
        apiUrl,
        { address: params.address, id: params.id },
        { signal: opts?.signal }
      ),

    getFills: (
      _client: PerpsSDKClient,
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> =>
      getFills(
        apiUrl,
        {
          address: params.address,
          limit: params.limit,
          cursor: params.cursor,
          startTime: params.startTime,
          endTime: params.endTime,
        },
        { signal: opts?.signal }
      ),

    getActivity: (
      _client: PerpsSDKClient,
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> =>
      getActivity(
        apiUrl,
        {
          address: params.address,
          limit: params.limit,
          cursor: params.cursor,
          startTime: params.startTime,
          endTime: params.endTime,
          type: params.type,
        },
        { signal: opts?.signal }
      ),

    getAsset: (
      _client: PerpsSDKClient,
      params: ProviderGetAssetParams,
      opts?: SDKRequestOptions
    ): Promise<Asset> =>
      getAsset(apiUrl, { symbol: params.symbol }, { signal: opts?.signal }),

    getAssets: (
      _client: PerpsSDKClient,
      opts?: SDKRequestOptions
    ): Promise<AssetsResponse> => getAssets(apiUrl, { signal: opts?.signal }),

    getPrices: (
      _client: PerpsSDKClient,
      params: ProviderGetPricesParams,
      opts?: SDKRequestOptions
    ): Promise<PricesResponse> =>
      getPrices(apiUrl, { symbols: params.symbols }, { signal: opts?.signal }),

    getOhlcv: (
      _client: PerpsSDKClient,
      params: ProviderGetOhlcvParams,
      opts?: SDKRequestOptions
    ): Promise<OhlcvResponse> =>
      getOhlcv(
        apiUrl,
        {
          symbol: params.symbol,
          interval: params.interval,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit,
        },
        { signal: opts?.signal }
      ),

    getOrderbook: (
      _client: PerpsSDKClient,
      params: ProviderGetOrderbookParams,
      opts?: SDKRequestOptions
    ): Promise<OrderbookResponse> =>
      getOrderbook(
        apiUrl,
        { symbol: params.symbol, depth: params.depth },
        { signal: opts?.signal }
      ),

    projectConfig: (
      config: AccountConfig,
      setup: ProviderSetup[],
      options: ProviderOption[]
    ): AccountConfigSetting[] => {
      if (config.provider !== PROVIDER_KEY) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `hyperliquidProvider.projectConfig received config for provider ` +
            `'${config.provider}'.`
        )
      }
      return projectHyperliquidConfigSettings(config, setup, options)
    },

    summarize: (
      account: AccountResponse,
      positions: Position[],
      prices: Record<string, string>,
      assets?: Asset[],
      collateralCurrencies?: ReadonlySet<string>
    ): AccountSummary =>
      summarizeHyperliquidAccount(
        account,
        positions,
        prices,
        assets,
        collateralCurrencies
      ),
  }
}
