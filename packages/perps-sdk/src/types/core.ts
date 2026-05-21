import type {
  AccountResponse,
  ActivitiesResponse,
  ActivityType,
  Address,
  Asset,
  AssetsResponse,
  FillsResponse,
  OhlcvInterval,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  OrdersResponse,
  PositionsResponse,
  PricesResponse,
} from '@lifi/perps-types'
import type { Account, WalletClient } from 'viem'
import type { AgentManager } from '../agent/AgentManager.js'

/**
 * Per-provider config — restricts which `markets` the WS client subscribes
 * to. Indexed by provider key.
 */
export interface ProviderConfig {
  markets?: string[]
}

/** @deprecated Use {@link ProviderConfig}. */
export type HyperliquidConfig = ProviderConfig

export interface ProviderConfigs {
  [provider: string]: ProviderConfig | undefined
}

export type RequestInterceptor = (
  url: string,
  options: RequestInit
) => RequestInit | Promise<RequestInit>

export interface SDKRequestOptions {
  signal?: AbortSignal
  /**
   * Lighter auth token for authenticated read endpoints (getOrders, getOrder,
   * getActivity). Mint via `lighterSigner.createAuthToken(deadline, context)`.
   * Forwarded as `Authorization: Bearer <token>` and never persisted by the
   * backend — read-only by design (8h max TTL, cannot authorize writes).
   */
  lighterAuthToken?: string
}

/**
 * Immutable snapshot of the resolved client configuration after defaults
 * are applied. Exposed via {@link PerpsSDKClient.config}.
 */
export interface PerpsBaseConfig {
  integrator: string
  apiKey: string
  apiUrl: string
  disableVersionCheck?: boolean
  requestInterceptor?: RequestInterceptor
  providers?: ProviderConfigs
}

export interface PerpsSDKClient {
  readonly config: PerpsBaseConfig
  readonly agentManager: AgentManager
  /** Wallet signer for setup actions — accepts any viem WalletClient (browser, private key, mnemonic). */
  readonly signer?: WalletClient<any, any, Account>
  /** Registered provider plugins, in the order they were passed at construction. */
  readonly providers: PerpsProvider[]
  /** Look up a registered {@link PerpsProvider} by its `type` key. */
  getProvider(key: string): PerpsProvider | undefined
}

/**
 * Read-side params for {@link PerpsProvider.getAccount}. The `provider`
 * field is implicit in the provider instance and so is not duplicated here.
 */
export interface ProviderGetAccountParams {
  address: Address
}

export interface ProviderGetPositionsParams {
  address: Address
  symbol?: string
  limit?: number
  cursor?: string
}

export interface ProviderGetOrdersParams {
  address: Address
  symbol?: string
  limit?: number
  cursor?: string
}

export interface ProviderGetOrderParams {
  address: Address
  id: string
}

export interface ProviderGetFillsParams {
  address: Address
  limit?: number
  cursor?: string
  startTime?: number
  endTime?: number
}

export interface ProviderGetActivityParams {
  address: Address
  limit?: number
  cursor?: string
  startTime?: number
  endTime?: number
  type?: ActivityType[]
}

export interface ProviderGetAssetParams {
  symbol: string
}

export interface ProviderGetPricesParams {
  symbols?: string[]
}

export interface ProviderGetOhlcvParams {
  symbol: string
  interval: OhlcvInterval
  startTime?: number
  endTime?: number
  limit?: number
}

export interface ProviderGetOrderbookParams {
  symbol: string
  depth?: number
}

/**
 * Provider plugin for {@link createPerpsClient}, modelled on
 * `@lifi/sdk`'s `SDKProvider`. Each provider is identified by `type`
 * (the wire key — `'hyperliquid'`, `'lighter'`, …) and implements the
 * read-side surface area for one DEX.
 *
 * Concrete implementations live in dedicated packages
 * (`@lifi/perps-sdk-provider-hyperliquid`, `@lifi/perps-sdk-provider-lighter`).
 * Consumers register providers up-front:
 *
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   apiKey: 'key',
 *   providers: [hyperliquidProvider(), lighterProvider()],
 * })
 * const account = await client.getProvider('hyperliquid')!.getAccount(client, { address })
 * ```
 *
 * Write-side actions (`createAction`, `executeAction`) remain on the core
 * client because they go through the LI.FI backend's generic action
 * pipeline — they are not per-provider plugin surface.
 */
export interface PerpsProvider {
  /**
   * Provider key, matching `Provider.key` from the backend's
   * `/providers` response (e.g. `'hyperliquid'`, `'lighter'`). Used to
   * look the provider up via {@link PerpsSDKClient.getProvider}.
   */
  readonly type: string

  getAccount(
    client: PerpsSDKClient,
    params: ProviderGetAccountParams,
    options?: SDKRequestOptions
  ): Promise<AccountResponse>

  getPositions(
    client: PerpsSDKClient,
    params: ProviderGetPositionsParams,
    options?: SDKRequestOptions
  ): Promise<PositionsResponse>

  getOrders(
    client: PerpsSDKClient,
    params: ProviderGetOrdersParams,
    options?: SDKRequestOptions
  ): Promise<OrdersResponse>

  getOrder(
    client: PerpsSDKClient,
    params: ProviderGetOrderParams,
    options?: SDKRequestOptions
  ): Promise<Order>

  getFills(
    client: PerpsSDKClient,
    params: ProviderGetFillsParams,
    options?: SDKRequestOptions
  ): Promise<FillsResponse>

  getActivity(
    client: PerpsSDKClient,
    params: ProviderGetActivityParams,
    options?: SDKRequestOptions
  ): Promise<ActivitiesResponse>

  getAsset(
    client: PerpsSDKClient,
    params: ProviderGetAssetParams,
    options?: SDKRequestOptions
  ): Promise<Asset>

  getAssets(
    client: PerpsSDKClient,
    options?: SDKRequestOptions
  ): Promise<AssetsResponse>

  getPrices(
    client: PerpsSDKClient,
    params: ProviderGetPricesParams,
    options?: SDKRequestOptions
  ): Promise<PricesResponse>

  getOhlcv(
    client: PerpsSDKClient,
    params: ProviderGetOhlcvParams,
    options?: SDKRequestOptions
  ): Promise<OhlcvResponse>

  getOrderbook(
    client: PerpsSDKClient,
    params: ProviderGetOrderbookParams,
    options?: SDKRequestOptions
  ): Promise<OrderbookResponse>
}
