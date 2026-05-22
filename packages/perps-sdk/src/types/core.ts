import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionStep,
  ActionType,
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
  Position,
  PositionsResponse,
  PricesResponse,
  ProviderOption,
  ProviderSetup,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import type { Account, WalletClient } from 'viem'
import type { AgentManager } from '../agent/AgentManager.js'
import type { Agent } from '../agent/types.js'

/**
 * Viem `WalletClient` shape used by `PerpsSDKClient.signer`. Aliased here so
 * provider plugins can name the type without re-deriving the viem generics.
 */
export type PerpsClientSigner = WalletClient<any, any, Account>

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
 */
export interface SignActionsContext {
  signer?: PerpsClientSigner
  agent?: Agent
}

/**
 * Per-call context passed to a provider's {@link
 * PerpsProvider.satisfyClientSetup} method. Provides the client and any
 * resolved L1 wallet signer the action needs (e.g. Lighter's
 * `APPROVE_READ_ONLY_TOKEN` mints via an EIP-191 personal_sign).
 */
export interface SatisfyClientSetupContext {
  address: Address
  /** L1 wallet signer (viem WalletClient). Set via `PerpsClient.setSigner`. */
  signer?: PerpsClientSigner
  /** Optional action-specific parameters forwarded by the caller. */
  params?: Record<string, unknown>
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
    setup: ProviderSetup[],
    options: ProviderOption[]
  ): AccountConfigSetting[]

  /**
   * Reduce the raw `AccountResponse` + positions + ambient prices into the
   * provider-agnostic {@link AccountSummary} roll-up (portfolio value,
   * available margin, margin used, unrealised PnL).
   *
   * Implementations own the venue-specific reduction rules:
   * Hyperliquid factors in unified-account abstraction modes against spot
   * balances; Lighter uses straight collateral. `assets` and
   * `collateralCurrencies` are optional inputs some implementations need
   * to value non-USD spot holdings; pass `undefined` if the provider does
   * not require them.
   */
  summarize(
    account: AccountResponse,
    positions: Position[],
    prices: Record<string, string>,
    assets?: Asset[],
    collateralCurrencies?: ReadonlySet<string>
  ): AccountSummary

  /**
   * Set of {@link ActionType}s this plugin handles fully client-side, with
   * no backend prerequisite staging. Today only Lighter's
   * `APPROVE_READ_ONLY_TOKEN` qualifies (EIP-191 personal_sign + direct
   * HTTP to Lighter's token-mint endpoint). When `PerpsClient.satisfy` is
   * invoked with one of these, it routes to {@link satisfyClientSetup}
   * instead of `signPrerequisite` + `satisfySetup`.
   */
  readonly clientSetupActions?: ReadonlySet<ActionType>

  /**
   * Run a client-only setup flow end-to-end. Required when
   * {@link clientSetupActions} is non-empty. Implementations resolve any
   * wallet signature / direct HTTP call internally; no backend round-trip.
   */
  satisfyClientSetup?(
    action: ActionType,
    client: PerpsSDKClient,
    ctx: SatisfyClientSetupContext
  ): Promise<void>

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
