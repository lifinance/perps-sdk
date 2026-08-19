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
  MarketRef,
  MarketSettings,
  Order,
  OrdersResponse,
  PerpsMarket,
  PerpsSigner,
  Position,
  PositionMarginConstraints,
  PositionsResponse,
  ProviderAction,
  Quote,
  QuoteSide,
  SignedActionStep,
  SigningMethod,
  TradeType,
  TwapOrder,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type {
  PerpsBaseConfig,
  PerpsClientSigner,
  SDKRequestOptions,
} from './config.js'
import type { DepositFlow } from './deposit.js'
import type { ProviderWithdrawableBalance } from './withdrawal.js'

/**
 * Low-level SDK client: resolved config, the optional end-user wallet, and the
 * registered provider plugins. Returned by {@link createPerpsClient} and
 * consumed by every service function.
 *
 * @public
 */
export interface PerpsSDKClient {
  readonly config: PerpsBaseConfig
  /** End-user wallet for USER-signed or on-chain EVM legs, when configured. */
  readonly userWallet?: PerpsClientSigner
  /** Providers bound to this client, in registration order. */
  readonly providers: PerpsProvider[]
  /** Look up a bound provider by its wire `type` key. */
  getProvider(key: string): PerpsProvider | undefined
}

/**
 * Progress for one on-chain leg of an `EVM_TX` batch (e.g. a native deposit's
 * `approve` then `deposit`). Emitted twice per leg: `submitted` once the wallet
 * broadcasts and the hash is known, then `confirmed` once the receipt mines. A
 * consumer can render a live per-transaction stepper from these.
 *
 * @public
 */
export interface SignActionProgress {
  index: number
  total: number
  action: ActionType
  functionName: string
  chainId: number
  /** Whether the transaction was broadcast or its receipt confirmed. */
  status: 'submitted' | 'confirmed'
  txHash: string
}

/**
 * Per-call context passed by `PerpsClient` to a provider's
 * {@link PerpsProviderPlugin.signActions} implementation. Carries the
 * configured end-user wallet, descriptor-declared signer roles, an optional
 * chain-switch helper, and an optional progress callback.
 *
 * @public
 */
export interface SignActionsContext {
  /** End-user wallet used for USER-signed or EVM transaction legs. */
  userWallet?: PerpsClientSigner
  /**
   * The signing batch's declared signers, from the action's `ProviderAction`
   * descriptor. The plugin branches on this to pick WHO signs (e.g.
   * Hyperliquid: `USER` → end-user wallet, `AGENT` → session keypair). Core
   * forwards the descriptor's `signers` as data; it does not branch on them.
   */
  signers?: PerpsSigner[]
  /**
   * Switch `userWallet` to `chainId` and resolve the client to broadcast with.
   * Bound by core to the consumer's `switchChain` hook and the resolved
   * `userWallet`: a no-op returning the same client when already on `chainId`,
   * else it switches and re-verifies, rejecting with `PerpsErrorCode.SDKError`
   * when the switch cannot be completed. Present only when a `switchChain` hook
   * is configured; a plugin whose legs broadcast on-chain (Lighter's `EVM_TX`)
   * calls it per leg, and falls back to a fail-loud wrong-chain guard when it is
   * absent (local/private-key signer, or no hook).
   */
  switchToChain?: (chainId: number) => Promise<PerpsClientSigner>
  /**
   * Optional progress sink for on-chain legs. A plugin whose legs broadcast
   * transactions (Lighter's `EVM_TX`) calls it as each leg is submitted and
   * confirmed, so a consumer can show a live per-transaction stepper. Bound by
   * core from the `onProgress` passed to {@link PerpsClient.execute}.
   */
  onProgress?: (progress: SignActionProgress) => void
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
  /** Entry price in quote currency per base unit. */
  entryPrice: number
  leverage: number
  /** `true` for long, `false` for short. */
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
 * Read params for {@link PerpsProviderPlugin.getDepositFlow}.
 *
 * @public
 */
export interface ProviderGetDepositFlowParams {
  address: Address
}

/**
 * Read params for {@link PerpsProviderPlugin.getWithdrawableBalances}.
 *
 * @public
 */
export interface ProviderGetWithdrawableBalancesParams {
  address: Address
}

/**
 * Read params for {@link PerpsProvider.getPositions}.
 *
 * @public
 */
export interface ProviderGetPositionsParams {
  address: Address
  /** Optional opaque `Market.id` filter (not a display symbol). */
  marketId?: string
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
}

/**
 * Read params for {@link PerpsProviderPlugin.getMarketSettings}.
 *
 * @public
 */
export interface ProviderGetMarketSettingsParams {
  address: Address
  /** The market's `id` and `categoryId`; the category identifies spot
   * markets, which carry no venue leverage state. */
  market: MarketRef
}

/**
 * Read params for {@link PerpsProvider.getOrders}.
 *
 * @public
 */
export interface ProviderGetOrdersParams {
  address: Address
  /** Optional opaque `Market.id` filter (not a display symbol). */
  marketId?: string
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
}

/**
 * Read params for {@link PerpsProvider.getRunningTwaps}.
 *
 * @public
 */
export interface ProviderGetRunningTwapsParams {
  address: Address
  /** Optional opaque `Market.id` filter (not a display symbol). */
  marketId?: string
}

/**
 * Read params for {@link PerpsProvider.getOrder}.
 *
 * @public
 */
export interface ProviderGetOrderParams {
  address: Address
  /** Venue order id, opaque to the SDK. */
  id: string
}

/**
 * Read params for {@link PerpsProvider.getFills}.
 *
 * @public
 */
export interface ProviderGetFillsParams {
  address: Address
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
  /** Include fills at or after this Unix timestamp in milliseconds. */
  startTime?: number
  /** Include fills at or before this Unix timestamp in milliseconds. */
  endTime?: number
}

/**
 * Read params for {@link PerpsProvider.getActivity}.
 *
 * @public
 */
export interface ProviderGetActivityParams {
  address: Address
  /** Maximum items returned; provider defaults and caps apply. */
  limit?: number
  /** Opaque pagination cursor from the previous response. */
  cursor?: string
  /** Include activity at or after this Unix timestamp in milliseconds. */
  startTime?: number
  /** Include activity at or before this Unix timestamp in milliseconds. */
  endTime?: number
  /** Optional filter for activity types. */
  type?: ActivityType[]
}

/**
 * Read params for {@link PerpsProviderPlugin.getQuote}. `provider` is implicit
 * in the provider instance and so is not duplicated here.
 *
 * @public
 */
export interface ProviderGetQuoteParams {
  /** Human `displaySymbol`, resolved against this provider and `type`. */
  symbol: string
  /** Trade direction used to choose asks for buys or bids for sells. */
  side: QuoteSide
  /** USD notional to fill. */
  size: number
  /** Product family used to disambiguate spot and perpetual markets. */
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
   * Setup actions the provider completes on its own, without surfacing a card
   * to the caller. `PerpsClient.checkSetup` drains each such pending step in
   * place — building, signing, and executing it with the provider's own
   * credentials — and omits it from the returned `setup` list. A descriptor
   * whose `signers` include {@link PerpsSigner.USER} is never treated as
   * internal, even when named here. Omit when the provider has no
   * self-completed setup steps.
   */
  readonly internalSetupActions?: readonly ActionType[]

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

  /**
   * The deposit flow this venue offers `params.address`, resolved from the
   * venue's own account and setup state — which collateral token a deposit must
   * land in, whether the address first needs the account-opening pipeline, and
   * whether venue setup gates naming a destination at all.
   *
   * Optional: a provider that cannot be funded through the SDK omits it, and
   * `PerpsClient.getDepositFlow` then resolves `undefined`.
   */
  getDepositFlow?(
    params: ProviderGetDepositFlowParams,
    options?: SDKRequestOptions
  ): Promise<DepositFlow>

  /**
   * The `(asset, route)` pairs `params.address` currently has something to
   * withdraw from, keyed by provider-native asset id. Only the venue knows how
   * its balance payload splits across routes, so the split is owned here; the
   * per-asset venue minimum is applied by `PerpsClient.getWithdrawableBalances`,
   * which holds the core asset registry.
   *
   * Optional: a provider whose withdrawals are not a per-route selection omits
   * it, and `PerpsClient.getWithdrawableBalances` then resolves `undefined`.
   */
  getWithdrawableBalances?(
    params: ProviderGetWithdrawableBalancesParams,
    options?: SDKRequestOptions
  ): Promise<ProviderWithdrawableBalance[]>

  getPositions(
    params: ProviderGetPositionsParams,
    options?: SDKRequestOptions
  ): Promise<PositionsResponse>

  /**
   * The user's current venue-side settings for one market — the margin mode
   * and leverage the next order on it will use. Optional because venues
   * expose this unevenly: Hyperliquid reads it directly (`activeAssetData`),
   * Lighter only reports it on an account's position row. `undefined` means
   * the venue has nothing to read for this market.
   */
  getMarketSettings?(
    params: ProviderGetMarketSettingsParams,
    options?: SDKRequestOptions
  ): Promise<MarketSettings | undefined>

  getOrders(
    params: ProviderGetOrdersParams,
    options?: SDKRequestOptions
  ): Promise<OrdersResponse>

  /**
   * Fetch the account's currently running TWAP parent orders directly from the
   * venue. Child slice orders are excluded.
   */
  getRunningTwaps?(
    params: ProviderGetRunningTwapsParams,
    options?: SDKRequestOptions
  ): Promise<TwapOrder[]>

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
   * Exact venue-owned constraints for changing `position`'s dedicated margin.
   * Pure — providers normalize raw venue quantities onto the position before
   * returning these inputs.
   *
   * @returns `undefined` when this position has no individual margin
   *   adjustment (for example a cross position or a cross-only venue).
   */
  positionMarginConstraints(
    position: Position
  ): PositionMarginConstraints | undefined

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
   * Observe the per-step results of an `/executeAction` round trip before the
   * core surfaces failures. Lets a provider react to structured failure codes
   * — e.g. evicting a locally stored credential the venue no longer accepts.
   */
  onExecuteResults?(address: Address, results: ActionResult[]): Promise<void>

  /**
   * Resolve a venue transaction hash to a block-explorer URL. Core calls it for
   * every `/executeAction` result the backend returned a `txHash` on, so the
   * explorer target stays provider-owned.
   *
   * Optional: a venue with no explorer (Ondo settles offchain) omits it, and
   * results then carry the hash alone. May also return `undefined` for an
   * instance whose explorer is not configured.
   */
  resolveExplorerLink?(txHash: string): string | undefined
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
