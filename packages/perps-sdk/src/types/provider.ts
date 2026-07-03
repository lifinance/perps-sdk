import type {
  AccountConfig,
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionResult,
  ActionStep,
  ActionType,
  ActivitiesResponse,
  ActivityType,
  FillsResponse,
  Market,
  Order,
  OrdersResponse,
  PerpsMarket,
  PerpsSigner,
  Position,
  PositionsResponse,
  ProviderAction,
  Quote,
  QuoteSide,
  RestCallSignedActionStep,
  SignedActionStep,
  SigningMethod,
  TradeType,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsBaseConfig,
  PerpsClientSigner,
  SDKRequestOptions,
} from './config.js'

/**
 * Low-level SDK client: resolved config, the optional end-user wallet, and the
 * registered provider plugins. Returned by {@link createPerpsClient} and
 * consumed by every service function.
 *
 * @public
 */
export interface PerpsSDKClient {
  readonly config: PerpsBaseConfig
  /** The end-user's wallet — accepts any viem WalletClient (browser, private key, mnemonic). */
  readonly userWallet?: PerpsClientSigner
  /** Registered providers, bound to this client, in construction order. */
  readonly providers: PerpsProvider[]
  /** Look up a registered bound {@link PerpsProvider} by its `type` key. */
  getProvider(key: string): PerpsProvider | undefined
}

/**
 * Per-call context passed by `PerpsClient` to a provider's {@link
 * PerpsProvider.signActions} method. Carries the end-user's wallet (when
 * configured); providers that own a session credential (e.g. the Hyperliquid
 * agent keypair, Lighter's API key) resolve it internally.
 *
 * @public
 */
export interface SignActionsContext {
  userWallet?: PerpsClientSigner
  /**
   * The signing batch's declared signers, from the action's `ProviderAction`
   * descriptor. The plugin branches on this to pick WHO signs (e.g.
   * Hyperliquid: `USER` → end-user wallet, `AGENT` → session keypair). Core
   * forwards the descriptor's `signers` as data; it does not branch on them.
   */
  signers?: PerpsSigner[]
}

/**
 * Signer-bearing wire fields a provider plugin contributes to an action's
 * `createAction` / `executeAction` requests — resolved by the plugin because
 * signer identity (WHO signs) is provider-owned. Returned by
 * {@link PerpsProviderPlugin.resolveActionRequest}.
 *
 * @public
 */
export interface ActionSignerContribution {
  /**
   * The on-wire `signerAddress` for an action a provider signs on the user's
   * behalf — the address of the provider-owned session keypair (Hyperliquid's
   * approved agent wallet). Sent on both `createAction` (so the backend builds
   * the right typed data) and `executeAction`. Omitted when the provider signs
   * as the user or with a non-EVM session credential (Lighter's API key).
   */
  signerAddress?: Address
  /**
   * Extra action params the plugin injects from its own signer state — e.g.
   * Hyperliquid's `agentAddress` for `APPROVE_AGENT`. Merged over the caller's
   * params.
   */
  params?: Record<string, unknown>
}

/**
 * Inputs for {@link PerpsProviderPlugin.estimateLiquidationPrice}:
 * `leverage` is the user-selected leverage for the new position, `isLong`
 * carries direction.
 *
 * @public
 */
export interface LiquidationEstimateParams {
  entryPrice: number
  leverage: number
  isLong: boolean
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
 * Read params for {@link PerpsProviderPlugin.accountExists}.
 *
 * @public
 */
export interface ProviderAccountExistsParams {
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
 * Read params for {@link PerpsProviderPlugin.getQuote}. `provider` is implicit
 * in the provider instance and so is not duplicated here.
 *
 * @public
 */
export interface ProviderGetQuoteParams {
  /** Human `displaySymbol`, e.g. `"BTC"`. Resolved against the provider's own markets, scoped by `type`. */
  symbol: string
  side: QuoteSide
  /** USD notional to fill. */
  size: number
  type: TradeType
}

/**
 * Listener invoked with each freshly computed {@link Quote} on a streaming
 * quote subscription.
 *
 * @public
 */
export type QuoteListener = (quote: Quote) => void

/**
 * Unbound provider plugin passed to {@link createPerpsClient}, modelled on
 * `@lifi/sdk`'s `SDKProvider`. Each provider is identified by `type` (the wire
 * key — `'hyperliquid'`, `'lighter'`, …) and implements the read-side surface
 * area for one DEX. Read methods are clientless — `(params, options?)`; the
 * runtime context they need is injected once via {@link bind} when
 * {@link createPerpsClient} calls {@link bindProvider}, and captured in the
 * factory's closure.
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
 * const account = await client.getProvider('hyperliquid')!.getAccount({ address })
 * ```
 *
 * Write-side actions (`createAction`, `executeAction`) remain on the core
 * client because they go through the LI.FI backend's generic action
 * pipeline — they are not per-provider plugin surface.
 *
 * @public
 */
export interface PerpsProviderPlugin {
  /**
   * Provider key, matching `Provider.key` from the backend's
   * `/providers` response (e.g. `'hyperliquid'`, `'lighter'`). Used to
   * look the provider up via {@link PerpsSDKClient.getProvider}.
   */
  readonly type: string

  /**
   * Inject the runtime {@link PerpsSDKClient} into the plugin once, during
   * {@link createPerpsClient}. The plugin captures it (config, fetch, retry,
   * provider registry) in its factory closure so the clientless read methods
   * can resolve their runtime deps at call time. Called exactly once per
   * registered plugin by {@link bindProvider}.
   */
  bind(client: PerpsSDKClient): void

  getAccount(
    params: ProviderGetAccountParams,
    options?: SDKRequestOptions
  ): Promise<AccountResponse>

  /**
   * Whether a provider account exists for `params.address`. Each venue owns its
   * own existence signal: Hyperliquid probes `preTransferCheck.userExists` (an
   * account exists once it has been funded, paying the one-time creation fee),
   * whereas Lighter resolves it from its `getAccount` → `AccountNotFound`
   * semantics. Used by `PerpsClient.checkSetup` to gate the deposit-first flow.
   */
  accountExists(
    params: ProviderAccountExistsParams,
    options?: SDKRequestOptions
  ): Promise<boolean>

  getPositions(
    params: ProviderGetPositionsParams,
    options?: SDKRequestOptions
  ): Promise<PositionsResponse>

  getOrders(
    params: ProviderGetOrdersParams,
    options?: SDKRequestOptions
  ): Promise<OrdersResponse>

  getOrder(
    params: ProviderGetOrderParams,
    options?: SDKRequestOptions
  ): Promise<Order>

  getFills(
    params: ProviderGetFillsParams,
    options?: SDKRequestOptions
  ): Promise<FillsResponse>

  getActivity(
    params: ProviderGetActivityParams,
    options?: SDKRequestOptions
  ): Promise<ActivitiesResponse>

  /**
   * Produce a one-shot fill {@link Quote} for `params.symbol` at `params.size`
   * USD notional on this venue. The provider resolves the symbol against its
   * own markets (matching `baseAsset.displaySymbol`, scoped by `params.type`),
   * walks its orderbook for the VWAP fill, and applies its public base fee
   * tier. Throws when no market matches the symbol+type.
   */
  getQuote(
    params: ProviderGetQuoteParams,
    options?: SDKRequestOptions
  ): Promise<Quote>

  /**
   * Roll an already-fetched {@link AccountResponse} (plus its positions) up
   * into an {@link AccountSummary}. Owned by the provider because the
   * margin/PnL content of the collateral rows is venue-specific: Hyperliquid
   * branches on its abstraction mode (in `disabled`/`dexAbstraction` the
   * venue rows are total equity — locked margin and unrealized PnL included;
   * in `unifiedAccount`/`portfolioMargin` spot holds the whole account),
   * whereas Lighter has a single flat collateral model. Pure — does no I/O.
   */
  getAccountSummary(
    account: AccountResponse,
    positions: Position[]
  ): AccountSummary

  /**
   * Format an order price onto the venue's tick grid for `market`. This is
   * the canonical, provider-correct formatting surface — venue tick rules
   * differ per provider, so provider-agnostic consumers must route every
   * order price through the market's own provider instead of applying one
   * venue's rules to another's markets. Pure — does no I/O.
   *
   * @returns The price as a wire-ready decimal string, trailing zeros
   *   stripped.
   * @throws {PerpsError} `ValidationError` when `market` lacks the tick
   *   metadata the venue's rules need (e.g. `Market.priceDecimals` absent).
   */
  formatOrderPrice(market: Market, price: number): string

  /**
   * Format an order size onto the venue's lot grid for `market`. Truncates
   * (never rounds up) so the formatted size cannot exceed the user's intended
   * size or available balance. Pure — does no I/O.
   *
   * @param size - Size in base-asset units as a non-negative magnitude.
   * @returns The size as a wire-ready decimal string, trailing zeros
   *   stripped.
   */
  formatOrderSize(market: Market, size: number): string

  /**
   * Estimate the liquidation price of a new isolated position on `market`
   * using the venue's margin model. A preview helper — for existing
   * positions, prefer `Position.liquidationPrice` from the venue. Pure —
   * does no I/O.
   *
   * @returns The estimated liquidation price, or `undefined` when the venue's
   *   model cannot be evaluated client-side (degenerate inputs, or `market`
   *   lacks the margin metadata the model needs).
   */
  estimateLiquidationPrice(
    market: PerpsMarket,
    params: LiquidationEstimateParams
  ): number | undefined

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
   * Contribute the signer-bearing wire fields for an action — the plugin owns
   * signer identity (WHO signs), so core asks the plugin rather than resolving
   * a `signerAddress` itself. The descriptor's `signers` are forwarded so the
   * plugin can branch on signer role: a provider that signs on the user's
   * behalf with a session keypair (Hyperliquid's agent) resolves — provisioning
   * one if needed — and returns the agent address as `signerAddress`; for
   * `APPROVE_AGENT` (user-signed) it returns the agent address only as the
   * `agentAddress` param. The agent address must be known pre-build so the
   * backend builds the right typed data, so core calls this before
   * `createAction` and threads the same result into `executeAction`.
   *
   * Optional: providers that sign as the user or with a non-EVM session
   * credential (Lighter's API key) omit it — core then sends no `signerAddress`
   * and no injected params.
   */
  resolveActionRequest?(
    action: ActionType,
    address: Address,
    signers: PerpsSigner[]
  ): Promise<ActionSignerContribution>

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
   * `method` mirrors the descriptor's `signingMethod`. The plugin owns every
   * arm, branching on the descriptor's `signers` internally: the EIP712 arm
   * signs with the user's wallet (read from `ctx.userWallet`) or the provider's
   * session keypair (Hyperliquid's agent), and `WASM_BLOB` / `EVM_TX` sign with
   * the provider's local credential (Lighter).
   */
  signActions?(
    method: SigningMethod,
    steps: ActionStep[],
    address: Address,
    ctx?: SignActionsContext
  ): Promise<SignedActionStep[]>

  /**
   * Execute credential-bearing rest-call steps directly against the venue.
   * Required for providers whose descriptors declare
   * `SigningMethod.AUTH_TOKEN`: the client-held credential (attached by
   * `signActions` as `headers`) must never transit the LI.FI backend, so the
   * venue call happens SDK-side. The provider owns base-URL resolution and
   * mapping the venue response onto {@link ActionResult}s — these results are
   * authoritative for the caller; `PerpsClient.execute` submits the steps to
   * the backend afterwards for bookkeeping only, with `headers` stripped.
   */
  executeRestCallActions?(
    steps: RestCallSignedActionStep[],
    address: Address,
    options?: SDKRequestOptions
  ): Promise<ActionResult[]>
}

/**
 * Runtime provider returned by {@link PerpsSDKClient.getProvider} and
 * {@link requireProvider}: a {@link PerpsProviderPlugin} that has been bound to
 * its client via {@link bindProvider}. The read methods are already clientless
 * on the plugin (`getX(params, options?)`); binding only drops the one-shot
 * {@link PerpsProviderPlugin.bind} hook so consumers cannot re-bind a live
 * provider.
 *
 * @public
 */
export type PerpsProvider = Omit<PerpsProviderPlugin, 'bind'>
