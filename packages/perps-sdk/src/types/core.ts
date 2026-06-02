import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionStep,
  ActionType,
  ActivitiesResponse,
  ActivityType,
  FillsResponse,
  Market,
  MarketsResponse,
  OhlcvInterval,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  OrdersResponse,
  Position,
  PositionsResponse,
  PricesResponse,
  ProviderAction,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import type { Account, Address, WalletClient } from 'viem'
import type { AgentManager } from '../agent/AgentManager.js'
import type { Agent } from '../agent/types.js'
import type { RetryConfig } from '../transport/retryPolicy.js'

/**
 * Viem `WalletClient` shape used by `PerpsSDKClient.signer`. Aliased here so
 * provider plugins can name the type without re-deriving the viem generics.
 *
 * @public
 */
export type PerpsClientSigner = WalletClient<any, any, Account>

/**
 * Per-provider config — restricts which `markets` the WS client subscribes
 * to. Indexed by provider key.
 *
 * @public
 */
export interface ProviderConfig {
  markets?: string[]
}

/**
 * @deprecated Use {@link ProviderConfig}.
 * @public
 */
export type HyperliquidConfig = ProviderConfig

/**
 * Map of per-provider {@link ProviderConfig}, keyed by provider key.
 *
 * @public
 */
export interface ProviderConfigs {
  [provider: string]: ProviderConfig | undefined
}

/**
 * Hook to rewrite each outgoing request's URL/`RequestInit` before it is sent.
 *
 * @public
 */
export type RequestInterceptor = (
  url: string,
  options: RequestInit
) => RequestInit | Promise<RequestInit>

/**
 * Per-call request options threaded through the service functions.
 *
 * @public
 */
export interface SDKRequestOptions {
  signal?: AbortSignal
  /**
   * Lighter auth token for authenticated read endpoints (getOrders, getOrder,
   * getActivity). Create via `lighterSigner.createAuthToken(deadline, context)`.
   * Forwarded as `Authorization: Bearer <token>` and never persisted by the
   * backend — read-only by design (8h max TTL, cannot authorize writes).
   */
  lighterAuthToken?: string
}

/**
 * Immutable snapshot of the resolved client configuration after defaults
 * are applied. Exposed via {@link PerpsSDKClient.config}.
 *
 * @public
 */
export interface PerpsBaseConfig {
  integrator: string
  apiKey: string
  apiUrl: string
  disableVersionCheck?: boolean
  requestInterceptor?: RequestInterceptor
  providers?: ProviderConfigs
  retry?: RetryConfig
  fetch?: typeof fetch
}

/**
 * Low-level SDK client: resolved config, agent manager, optional wallet
 * signer, and the registered provider plugins. Returned by
 * {@link createPerpsClient} and consumed by every service function.
 *
 * @public
 */
export interface PerpsSDKClient {
  readonly config: PerpsBaseConfig
  readonly agentManager: AgentManager
  /** Wallet signer for setup actions — accepts any viem WalletClient (browser, private key, mnemonic). */
  readonly signer?: PerpsClientSigner
  /** Registered provider plugins, in the order they were passed at construction. */
  readonly providers: PerpsProvider[]
  /** Look up a registered {@link PerpsProvider} by its `type` key. */
  getProvider(key: string): PerpsProvider | undefined
}

/**
 * Per-call context passed by `PerpsClient` to a provider's {@link
 * PerpsProvider.signActions} method. Carries the resolved wallet signer
 * (when configured) and the resolved agent keypair (when the signing-mode +
 * descriptor combination requires one); providers pick whichever they need.
 *
 * @public
 */
export interface SignActionsContext {
  signer?: PerpsClientSigner
  agent?: Agent
}

/**
 * Read-side params for {@link PerpsProvider.getAccount}. The `provider`
 * field is implicit in the provider instance and so is not duplicated here.
 *
 * @public
 */
export interface ProviderGetAccountParams {
  address: Address
}

/**
 * Read params for {@link PerpsProvider.getPositions}.
 *
 * @public
 */
export interface ProviderGetPositionsParams {
  address: Address
  /** Optional filter — opaque `Market.id` (not `displaySymbol`). */
  marketId?: string
  limit?: number
  cursor?: string
}

/**
 * Read params for {@link PerpsProvider.getOrders}.
 *
 * @public
 */
export interface ProviderGetOrdersParams {
  address: Address
  /** Optional filter — opaque `Market.id` (not `displaySymbol`). */
  marketId?: string
  limit?: number
  cursor?: string
}

/**
 * Read params for {@link PerpsProvider.getOrder}.
 *
 * @public
 */
export interface ProviderGetOrderParams {
  address: Address
  id: string
}

/**
 * Read params for {@link PerpsProvider.getFills}.
 *
 * @public
 */
export interface ProviderGetFillsParams {
  address: Address
  limit?: number
  cursor?: string
  startTime?: number
  endTime?: number
}

/**
 * Read params for {@link PerpsProvider.getActivity}.
 *
 * @public
 */
export interface ProviderGetActivityParams {
  address: Address
  limit?: number
  cursor?: string
  startTime?: number
  endTime?: number
  type?: ActivityType[]
}

/**
 * Read params for {@link PerpsProvider.getMarket}.
 *
 * @public
 */
export interface ProviderGetMarketParams {
  /** Opaque provider `Market.id` (not `displaySymbol`). */
  marketId: string
}

/**
 * Read params for {@link PerpsProvider.getPrices}.
 *
 * @public
 */
export interface ProviderGetPricesParams {
  /** Optional filter — opaque `Market.id`s. */
  marketIds?: string[]
}

/**
 * Read params for {@link PerpsProvider.getOhlcv}.
 *
 * @public
 */
export interface ProviderGetOhlcvParams {
  /** Opaque provider `Market.id` (not `displaySymbol`). */
  marketId: string
  interval: OhlcvInterval
  startTime?: number
  endTime?: number
  limit?: number
}

/**
 * Read params for {@link PerpsProvider.getOrderbook}.
 *
 * @public
 */
export interface ProviderGetOrderbookParams {
  /** Opaque provider `Market.id` (not `displaySymbol`). */
  marketId: string
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
 *
 * @public
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

  getMarket(
    client: PerpsSDKClient,
    params: ProviderGetMarketParams,
    options?: SDKRequestOptions
  ): Promise<Market>

  getMarkets(
    client: PerpsSDKClient,
    options?: SDKRequestOptions
  ): Promise<MarketsResponse>

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

  /**
   * Project a typed {@link AccountConfig} against the provider's `setup`
   * + `options` descriptors into `AccountConfigSetting[]`. Used by
   * `PerpsClient.getAccount` to attach a `settings` array to the response —
   * one entry per descriptor, in `setup`-then-`options` order.
   *
   * Implementations receive the union-typed `AccountConfig` and narrow on
   * `config.provider` themselves; the dispatcher in `PerpsClient` does not
   * narrow before calling.
   */
  projectConfig(
    config: AccountConfig,
    setup: ProviderAction[],
    options: ProviderAction[]
  ): AccountConfigSetting[]

  /**
   * Reduce the raw `AccountResponse` + positions into the provider-agnostic
   * {@link AccountSummary} roll-up (portfolio value, available margin, margin
   * used, unrealised PnL).
   *
   * Branch-free arithmetic over the response's `balances` /
   * `collateralBalances` partition — the provider plugin has already
   * determined collateral and filled `Balance.valueUsd`, so this is the same
   * computation for every provider.
   */
  summarize(account: AccountResponse, positions: Position[]): AccountSummary

  /**
   * Per-setup-action params the SDK should inject into `createAction` calls
   * when staging the provider setup. Used for plugin-side state the backend
   * needs to make a correct idempotency decision (e.g. Lighter's known local
   * API public key). Returns an empty object when the plugin has no params
   * to contribute for the action. Optional — providers without local state
   * can omit it entirely.
   */
  resolveSetupParams?(
    action: ActionType,
    address: Address
  ): Promise<Record<string, unknown>>

  /**
   * Sign a batch of unsigned {@link ActionStep}s belonging to one
   * `SigningMethod` arm. Returns the matching {@link SignedActionStep}s in
   * the same order — the core `PerpsClient.execute` then forwards them to
   * `/executeAction`.
   *
   * Optional: providers that do not implement write actions (read-only
   * plugins) may omit it. `PerpsClient.execute` throws `PerpsErrorCode.SDKError`
   * when an action requires a delegated signing method but the resolved
   * provider has no `signActions`.
   *
   * `method` mirrors the descriptor's `signingMethod`. `EIP712` stays on
   * `PerpsClient` (it goes through the agent or user wallet generically);
   * providers only need to handle the method arms they actually own
   * (`WASM_BLOB` for Lighter, `EVM_TX` where the on-chain target is
   * provider-specific).
   */
  signActions?(
    method: SigningMethod,
    steps: ActionStep[],
    address: Address,
    ctx?: SignActionsContext
  ): Promise<SignedActionStep[]>
}
