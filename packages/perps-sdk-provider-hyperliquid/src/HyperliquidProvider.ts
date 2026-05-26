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
  resolveRetryPolicy,
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
import {
  HYPERLIQUID_RETRY_DEFAULTS,
  type InfoRequestOptions,
} from './utils/infoClient.js'

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

  const resolveOpts = (
    client: PerpsSDKClient,
    signal?: AbortSignal
  ): InfoRequestOptions => ({
    signal,
    policy: resolveRetryPolicy(
      HYPERLIQUID_RETRY_DEFAULTS,
      client.config.retry,
      PROVIDER_KEY
    ),
    fetchImpl: client.config.fetch,
  })

  return {
    type: PROVIDER_KEY,

    getAccount: (
      client: PerpsSDKClient,
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> =>
      getAccount(
        apiUrl,
        { address: params.address },
        resolveOpts(client, opts?.signal)
      ),

    getPositions: (
      client: PerpsSDKClient,
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
        resolveOpts(client, opts?.signal)
      ),

    getOrders: (
      client: PerpsSDKClient,
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
        resolveOpts(client, opts?.signal)
      ),

    getOrder: (
      client: PerpsSDKClient,
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> =>
      getOrder(
        apiUrl,
        { address: params.address, id: params.id },
        resolveOpts(client, opts?.signal)
      ),

    getFills: (
      client: PerpsSDKClient,
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
        resolveOpts(client, opts?.signal)
      ),

    getActivity: (
      client: PerpsSDKClient,
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
        resolveOpts(client, opts?.signal)
      ),

    getAsset: (
      client: PerpsSDKClient,
      params: ProviderGetAssetParams,
      opts?: SDKRequestOptions
    ): Promise<Asset> =>
      getAsset(
        apiUrl,
        { symbol: params.symbol },
        resolveOpts(client, opts?.signal)
      ),

    getAssets: (
      client: PerpsSDKClient,
      opts?: SDKRequestOptions
    ): Promise<AssetsResponse> =>
      getAssets(apiUrl, resolveOpts(client, opts?.signal)),

    getPrices: (
      client: PerpsSDKClient,
      params: ProviderGetPricesParams,
      opts?: SDKRequestOptions
    ): Promise<PricesResponse> =>
      getPrices(
        apiUrl,
        { symbols: params.symbols },
        resolveOpts(client, opts?.signal)
      ),

    getOhlcv: (
      client: PerpsSDKClient,
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
        resolveOpts(client, opts?.signal)
      ),

    getOrderbook: (
      client: PerpsSDKClient,
      params: ProviderGetOrderbookParams,
      opts?: SDKRequestOptions
    ): Promise<OrderbookResponse> =>
      getOrderbook(
        apiUrl,
        { symbol: params.symbol, depth: params.depth },
        resolveOpts(client, opts?.signal)
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
