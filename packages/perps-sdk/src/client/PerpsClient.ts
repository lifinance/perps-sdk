import type {
  AccountConfigSetting,
  AccountResponse,
  AccountSummary,
  ActionParamsMap,
  ActionResult,
  ActionStep,
  AvailableToTrade,
  CreateActionResponse,
  ExecuteActionResponse,
  MarketRef,
  MarketSettings,
  MetaActionType,
  Order,
  OrdersResponse,
  PortfolioHistoryResponse,
  Position,
  PositionMarginConstraints,
  Provider,
  ProviderAction,
  SetupAction,
  SetupOption,
  SignedActionStep,
} from '@lifi/perps-types'
import {
  ActionRelay,
  ActionType,
  META_PROVIDER,
  PerpsErrorCode,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { Address } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { getAssetRegistry, toAssetDisplay } from '../registry/assetRegistry.js'
import { getMarketRegistry } from '../registry/marketRegistry.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getAccount as fetchAccount } from '../services/getAccount.js'
import {
  getOrder as fetchOrder,
  type GetOrderParams,
} from '../services/getOrder.js'
import {
  getOrders as fetchOrders,
  type GetOrdersParams,
} from '../services/getOrders.js'
import { getProviders } from '../services/getProviders.js'
import type {
  BuildProviderSetupParams,
  CancelOrdersParams,
  CancelTwapOrderParams,
  CreateReferralCodeActionParams,
  ExecuteMetaActionParams,
  ExecuteProviderSetupParams,
  ExecuteProviderSetupResult,
  GetAccountResult,
  GetDepositFlowParams,
  GetPortfolioHistoryParams,
  GetSetupParams,
  GetWithdrawableBalancesParams,
  ModifyOrdersParams,
  PerpsClientOptions,
  PlaceOrderParams,
  PlaceTriggerOrderParams,
  PlaceTwapOrderParams,
  ProviderSetup,
  SendAssetActionParams,
  SubmitOnboardingParams,
  WithdrawParams,
} from '../types/api.js'
import type {
  PerpsClientSigner,
  SDKRequestOptions,
  SwitchChainHook,
} from '../types/config.js'
import type { DepositFlow } from '../types/deposit.js'
import type {
  ActionSignerContribution,
  PerpsProvider,
  PerpsSDKClient,
  SignActionProgress,
  SignActionsContext,
} from '../types/provider.js'
import type { WithdrawableBalance } from '../types/withdrawal.js'
import { isUserFacingSetupStep } from '../utils/setupActions.js'
import { signTypedDataWithSigner } from '../utils/signTypedData.js'
import {
  eip712DomainChainId,
  switchSigningChain,
  userEip712TargetChainId,
} from '../utils/switchChain.js'
import { createPerpsClient } from './createPerpsClient.js'
import { requireProvider as resolveProvider } from './requireProvider.js'

/** Absent `sequence` sorts last, so an unordered step gates nothing. */
function sequenceOf(descriptor: ProviderAction): number {
  return descriptor.sequence ?? Number.MAX_SAFE_INTEGER
}

const SIGNERS: ReadonlySet<string> = new Set(Object.values(PerpsSigner))
const RELAYS: ReadonlySet<string> = new Set(Object.values(ActionRelay))

/**
 * Reject provider metadata whose steps the SDK cannot classify. A step with no
 * known `signer`, `relay`, `options` or `revoke` would otherwise read as
 * satisfied and report a not-onboarded account as ready.
 */
function assertSetupContract(metadata: Provider): void {
  const reject = (step: ActionType, problem: string): never => {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Provider '${metadata.key}' step '${step}' ${problem}; this SDK needs a ` +
        `backend that emits signer, relay, options and revoke.`
    )
  }
  for (const descriptor of [...metadata.setup, ...metadata.actions]) {
    if (!SIGNERS.has(descriptor.signer)) {
      reject(descriptor.type, 'declares no known signer')
    }
    if (!RELAYS.has(descriptor.relay)) {
      reject(descriptor.type, 'declares no known relay')
    }
  }
  const actionTypes = new Set(metadata.actions.map((d) => d.type))
  for (const descriptor of metadata.setup) {
    if (descriptor.options === undefined) {
      reject(descriptor.type, 'declares no options')
    }
    if (descriptor.revoke === undefined) {
      reject(descriptor.type, 'declares no revoke')
    }
    if (descriptor.revoke !== null && !actionTypes.has(descriptor.revoke)) {
      reject(
        descriptor.type,
        `revokes with '${descriptor.revoke}', which Provider.actions does not declare`
      )
    }
    const defaults = (descriptor.options ?? []).filter(
      (option) => option.default === true
    )
    if (defaults.length > 1) {
      reject(descriptor.type, 'marks more than one option default')
    }
  }
}

function defaultOption(descriptor: SetupAction): SetupOption | undefined {
  return descriptor.options?.find((option) => option.default === true)
}

/**
 * Whether the SDK fulfils a pending setup step itself. A USER-signed step is
 * never drained: it would prompt the user's wallet from inside `checkSetup`.
 * A choice drains only through its `default` option.
 */
function isDrainable(descriptor: SetupAction): boolean {
  return (
    descriptor.signer === PerpsSigner.SDK &&
    (descriptor.options === null || defaultOption(descriptor) !== undefined)
  )
}

/** Only a USER-signed non-choice step is staged for the user to sign. */
function isStageable(descriptor: SetupAction): boolean {
  return descriptor.options === null && descriptor.signer === PerpsSigner.USER
}

function satisfiedTypes(settings: AccountConfigSetting[]): Set<ActionType> {
  return new Set(
    settings.filter((setting) => setting.satisfied).map((s) => s.type)
  )
}

/** The choice option whose every bound param equals the projected value. */
function selectedOption(
  descriptor: SetupAction,
  settings: AccountConfigSetting[]
): SetupOption | null {
  if (descriptor.options === null) {
    return null
  }
  const values =
    settings.find((setting) => setting.type === descriptor.type)?.values ?? []
  return (
    descriptor.options.find((option) => {
      const bound = Object.entries(option.params)
      return (
        bound.length > 0 &&
        bound.every(([name, value]) =>
          values.some((v) => v.name === name && v.value === value)
        )
      )
    }) ?? null
  )
}

/** Throw the first per-action failure a 200 OK `/executeAction` carried. */
function assertAllSucceeded(results: ActionResult[]): void {
  const failure = results.find((r) => !r.success)
  if (failure) {
    throw new PerpsError(
      failure.errorCode ?? PerpsErrorCode.ExchangeRejected,
      failure.error
    )
  }
}

/**
 * Look up an action's descriptor in the provider's metadata. Throws if the
 * action isn't declared — defensive: better to fail loudly than to mis-sign.
 */
function findActionDescriptor(
  metadata: Provider,
  action: ActionType
): ProviderAction {
  const descriptor = [...metadata.setup, ...metadata.actions].find(
    (d) => d.type === action
  )
  if (!descriptor) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Provider '${metadata.key}' does not declare action '${action}'.`
    )
  }
  return descriptor
}

/**
 * Split an ordered `createAction` batch into consecutive runs of steps that
 * share one descriptor. A batch is a chain and may mix descriptors — a
 * Hyperliquid `placeOrder` can arrive with a USER-signed builder-fee approval
 * ahead of the SDK-signed order — and each run must be signed by its own
 * descriptor's signer.
 *
 * @throws {PerpsError} When a step's action is not declared by the provider.
 */
function groupStepsByDescriptor(
  metadata: Provider,
  steps: ActionStep[]
): { descriptor: ProviderAction; steps: ActionStep[] }[] {
  const groups: { descriptor: ProviderAction; steps: ActionStep[] }[] = []
  for (const step of steps) {
    const descriptor = findActionDescriptor(metadata, step.action)
    const current = groups.at(-1)
    if (current !== undefined && current.descriptor.type === descriptor.type) {
      current.steps.push(step)
      continue
    }
    groups.push({ descriptor, steps: [step] })
  }
  return groups
}

/**
 * The primary high-level perps API: wraps a {@link PerpsSDKClient} and owns the
 * end-to-end signing pipeline for provider setup, orders, and account-level
 * actions. Construct via `new PerpsClient(options)` or the SDK's higher-level
 * wiring.
 *
 * @public
 */
export class PerpsClient {
  private sdkClient: PerpsSDKClient
  private providerMetadataCache: Map<string, Provider> = new Map()
  private _userWallet: PerpsSDKClient['userWallet'] | undefined
  private _switchChain: SwitchChainHook | undefined

  constructor(options: PerpsClientOptions) {
    this.sdkClient = createPerpsClient({
      integrator: options.integrator,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      providers: options.providers,
    })
    this._switchChain = options.switchChain
  }

  /**
   * Set or update the end-user's wallet. Used whenever an action's descriptor
   * names `PerpsSigner.USER` as its `signer`. Pass undefined to clear.
   *
   * @public
   */
  setUserWallet(userWallet: PerpsSDKClient['userWallet']): void {
    this._userWallet = userWallet
    Object.defineProperty(this.sdkClient, 'userWallet', {
      get: () => this._userWallet,
      configurable: true,
    })
  }

  /**
   * Set or replace the wallet chain-switch hook invoked before a USER-signed
   * EIP-712 action is signed. Mirrors {@link setUserWallet}. Pass undefined to
   * clear — cleared, a wallet on the wrong chain signs offline without a switch.
   *
   * @public
   */
  setSwitchChain(switchChain: SwitchChainHook | undefined): void {
    this._switchChain = switchChain
  }

  /**
   * The underlying low-level {@link PerpsSDKClient} (config, user wallet,
   * provider registry) backing this instance.
   *
   * @public
   */
  get client(): PerpsSDKClient {
    return this.sdkClient
  }

  private async getProviderMetadata(provider: string): Promise<Provider> {
    let metadata = this.providerMetadataCache.get(provider)
    if (!metadata) {
      const { providers } = await getProviders(this.sdkClient)
      for (const d of providers) {
        this.providerMetadataCache.set(d.key, d)
      }
      metadata = this.providerMetadataCache.get(provider)
    }

    if (!metadata) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported provider: ${provider}`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }
    assertSetupContract(metadata)
    return metadata
  }

  /**
   * Resolve the registered provider plugin for `provider`, throwing a
   * `PerpsError` when the caller has not registered one via the SDK's
   * `providers` option. The plugin owns signer identity and write-side signing.
   */
  private requireProvider(provider: string): PerpsProvider {
    return resolveProvider(this.sdkClient, provider)
  }

  /** Read active or historical orders from the selected venue. */
  async getOrders(
    params: GetOrdersParams,
    options?: SDKRequestOptions
  ): Promise<OrdersResponse> {
    return fetchOrders(this.sdkClient, params, options)
  }

  /** Read one venue order through the provider's unified mapper. */
  async getOrder(
    params: GetOrderParams,
    options?: SDKRequestOptions
  ): Promise<Order> {
    return fetchOrder(this.sdkClient, params, options)
  }

  /**
   * Ask the provider plugin for the signer-bearing wire fields of `action` —
   * the on-wire `signerAddress` and any signer-derived params (e.g.
   * Hyperliquid's `agentAddress` for `APPROVE_AGENT`). Forwards the descriptor's
   * `signer` so the plugin can branch on signer role. Returns empty when the
   * plugin signs as the user or with a non-EVM credential. Core constructs no
   * `signerAddress` itself; signer identity is plugin-owned.
   */
  private async resolveActionRequest(
    provider: string,
    descriptor: ProviderAction,
    address: Address
  ): Promise<ActionSignerContribution> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.resolveActionRequest !== 'function') {
      return {}
    }
    return plugin.resolveActionRequest(
      descriptor.type,
      address,
      descriptor.signer
    )
  }

  /**
   * Delegate signing of `actions` to the provider plugin, one call per
   * consecutive run of steps sharing a descriptor. Each call carries that
   * descriptor's `signingMethod` and `signer`, so a mixed batch signs every
   * step with the signer its own descriptor declares; the signed steps come
   * back in the batch's original order. The plugin owns every signing arm and
   * branches on `signer` internally, reading the end-user's wallet from the
   * {@link SignActionsContext} when an arm signs as the user.
   *
   * @throws {PerpsError} When a step's action is not declared by the provider,
   *   or the plugin implements no `signActions`.
   */
  private async delegateSignActions(
    provider: string,
    address: Address,
    metadata: Provider,
    actions: ActionStep[],
    onProgress?: (progress: SignActionProgress) => void
  ): Promise<SignedActionStep[]> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.signActions !== 'function') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Provider '${provider}' does not implement signActions.`
      )
    }
    const signed: SignedActionStep[] = []
    for (const group of groupStepsByDescriptor(metadata, actions)) {
      const userWallet = await this.resolveSigningWallet(
        group.descriptor,
        group.steps
      )
      signed.push(
        ...(await plugin.signActions(
          group.descriptor.signingMethod,
          group.steps,
          address,
          this.buildSignActionsContext(group.descriptor, userWallet, onProgress)
        ))
      )
    }
    return signed
  }

  /**
   * Let the plugin observe `/executeAction` per-step results before the core
   * surfaces failures — e.g. to evict a locally stored credential the venue
   * rejected.
   */
  private async notifyExecuteResults(
    provider: string,
    address: Address,
    results: ActionResult[]
  ): Promise<void> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.onExecuteResults === 'function') {
      await plugin.onExecuteResults(address, results)
    }
  }

  /**
   * Attach a provider-built explorer URL to every result the backend returned a
   * venue `txHash` on. The provider owns its explorer target, so core only asks
   * — a plugin without the hook leaves results untouched.
   */
  private resolveExplorerLinks(
    provider: string,
    results: ActionResult[]
  ): ActionResult[] {
    const plugin = this.requireProvider(provider)
    const resolveLink = plugin.resolveExplorerLink?.bind(plugin)
    if (resolveLink === undefined) {
      return results
    }
    return results.map((result) => {
      if (!result.success || result.txHash === undefined) {
        return result
      }
      const explorerLink = resolveLink(result.txHash)
      return explorerLink === undefined ? result : { ...result, explorerLink }
    })
  }

  /**
   * Resolve the wallet that signs `actions`. For a USER-signed EIP-712 batch,
   * switch the configured wallet to the action's target chain via the
   * `switchChain` hook and return the switched client; the switch is transient
   * — `sdkClient.userWallet` is never mutated. All other batches (agent-signed,
   * non-EIP-712, or no configured wallet) return the configured wallet as-is.
   */
  private async resolveSigningWallet(
    descriptor: ProviderAction,
    actions: ActionStep[]
  ): Promise<PerpsClientSigner | undefined> {
    const wallet = this.sdkClient.userWallet
    if (!wallet) {
      return undefined
    }
    const targetChainId = userEip712TargetChainId(descriptor, actions)
    if (targetChainId === undefined) {
      return wallet
    }
    return switchSigningChain(wallet, targetChainId, this._switchChain)
  }

  /**
   * Resolve the wallet that signs a meta action's steps. Meta actions carry no
   * provider descriptor, so the target chain comes from the step's EIP-712
   * domain. The switch is transient — `sdkClient.userWallet` is never mutated.
   */
  private async resolveMetaSigningWallet(
    actions: ActionStep[]
  ): Promise<PerpsClientSigner> {
    const wallet = this.sdkClient.userWallet
    if (!wallet) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'No user wallet configured; call setUserWallet() before signing a meta action.'
      )
    }
    const targetChainId = eip712DomainChainId(actions)
    if (targetChainId === undefined) {
      return wallet
    }
    return switchSigningChain(wallet, targetChainId, this._switchChain)
  }

  /**
   * Assemble the per-call context the provider plugin needs in order to sign:
   * the end-user's wallet and the descriptor's declared `signer`. Core
   * forwards `signer` as data so the plugin can pick WHO signs; it does not
   * branch on it. Provider-owned session credentials (the Hyperliquid agent
   * keypair, Lighter's API key) are resolved inside the provider's
   * `signActions`, not threaded through here.
   *
   * `userWallet` overrides the configured wallet for this signing pass only —
   * `resolveSigningWallet` supplies the chain-switched client without mutating
   * `sdkClient.userWallet`.
   *
   * When a `switchChain` hook is configured, `switchToChain` is bound to the
   * resolved wallet so a plugin can switch per leg mid-batch (Lighter's
   * `EVM_TX` broadcasts); the switch stays transient — it never mutates
   * `sdkClient.userWallet`.
   */
  private buildSignActionsContext(
    descriptor: ProviderAction,
    userWallet?: PerpsClientSigner,
    onProgress?: (progress: SignActionProgress) => void
  ): SignActionsContext {
    const ctx: SignActionsContext = { signer: descriptor.signer }
    if (onProgress !== undefined) {
      ctx.onProgress = onProgress
    }
    const wallet = userWallet ?? this.sdkClient.userWallet
    if (wallet !== undefined) {
      ctx.userWallet = wallet
      const switchChain = this._switchChain
      if (switchChain !== undefined) {
        ctx.switchToChain = (chainId) =>
          switchSigningChain(wallet, chainId, switchChain)
      }
    }
    return ctx
  }

  /**
   * Sign a single provider setup action step by delegating to the provider
   * plugin, which branches on the step's signing scheme internally. Lets
   * consumers collect signed setup actions without embedding per-method
   * signing logic.
   *
   * Returns `undefined` when the plugin executed the action entirely
   * client-side (e.g. Lighter's token-authenticated venue mutations), leaving
   * no backend-bound step to submit.
   *
   * @throws {PerpsError} When the step's action is not declared by the provider.
   */
  private async signProviderSetupAction(
    provider: string,
    address: Address,
    step: ActionStep
  ): Promise<SignedActionStep | undefined> {
    const metadata = await this.getProviderMetadata(provider)
    const [signed] = await this.delegateSignActions(
      provider,
      address,
      metadata,
      [step]
    )
    return signed
  }

  /**
   * Build (but do not sign or submit) the unsigned action steps for `action`,
   * letting the provider plugin contribute any signer-bearing request fields.
   *
   * @public
   */
  async buildAction<T extends ActionType>(
    action: T,
    params: { provider: string; address: Address; params: ActionParamsMap[T] }
  ): Promise<CreateActionResponse> {
    const metadata = await this.getProviderMetadata(params.provider)
    const descriptor = findActionDescriptor(metadata, action)
    const { signerAddress, params: signerParams } =
      await this.resolveActionRequest(
        params.provider,
        descriptor,
        params.address
      )
    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action,
      params: {
        ...params.params,
        ...signerParams,
      } as ActionParamsMap[T],
    })
  }

  /**
   * Fetch the user's account state from the backend and attach the
   * SDK-projected `settings` array — one `AccountConfigSetting` per
   * descriptor on `Provider.setup`. Callers read
   * `result.settings` directly without re-deriving values from the typed
   * `AccountConfig`.
   *
   * @throws {PerpsError} When the provider plugin is not registered, or the
   *   backend account fetch fails.
   * @public
   */
  async getAccount(params: {
    provider: string
    address: Address
  }): Promise<GetAccountResult> {
    const plugin = this.requireProvider(params.provider)
    const [response, metadata] = await Promise.all([
      fetchAccount(this.sdkClient, params),
      this.getProviderMetadata(params.provider),
    ])
    const settings = plugin.projectConfig(response.config, metadata.setup)
    return { ...response, settings }
  }

  /**
   * The user's current venue-side settings for a market — the margin mode
   * and leverage the next order on it will use. Resolves `undefined` when
   * the venue exposes no readable setting for the market (or the provider
   * has no such read at all).
   *
   * @throws {PerpsError} When the provider plugin is not registered.
   * @public
   */
  async getMarketSettings(params: {
    provider: string
    address: Address
    market: MarketRef
  }): Promise<MarketSettings | undefined> {
    const plugin = this.requireProvider(params.provider)
    return plugin.getMarketSettings?.({
      address: params.address,
      market: params.market,
    })
  }

  /**
   * The amounts `params.address` can still buy and sell on one market, in
   * that market's margin asset. The order panel reads this per-market figure;
   * account displays read the account-scoped
   * {@link AccountSummary.availableMargin} instead.
   *
   * Providers that read a per-market figure answer it directly. For every
   * other provider this falls back to the account summary, so both sides
   * equal `availableMargin` and the asset is the market's quote asset.
   *
   * @throws {PerpsError} When the provider plugin is not registered, or the
   *   market is unknown to the provider's market registry.
   * @public
   */
  async getAvailableToTrade(
    params: {
      provider: string
      address: Address
      marketId: string
    },
    options?: SDKRequestOptions
  ): Promise<AvailableToTrade> {
    const plugin = this.requireProvider(params.provider)
    const perMarket = await plugin.getAvailableToTrade?.(
      { address: params.address, marketId: params.marketId },
      options
    )
    if (perMarket !== undefined) {
      return perMarket
    }

    const registry = getMarketRegistry(this.sdkClient, params.provider)
    await registry.sync()
    const market = registry.require(params.marketId)
    const account = await fetchAccount(
      this.sdkClient,
      { provider: params.provider, address: params.address },
      options
    )
    const { availableMargin } = plugin.getAccountSummary(
      account,
      account.positions
    )
    return {
      providerId: market.providerId,
      marketId: market.id,
      asset: toAssetDisplay(market.quoteAsset),
      buy: availableMargin,
      sell: availableMargin,
    }
  }

  /**
   * Resolve the exact venue-owned margin requirements for `position`.
   * Returns `undefined` when the position has no individual margin adjustment.
   *
   * @public
   */
  getPositionMarginConstraints(
    position: Position
  ): PositionMarginConstraints | undefined {
    return this.requireProvider(
      position.market.providerId
    ).positionMarginConstraints(position)
  }

  /**
   * Roll an already-fetched {@link AccountResponse} (plus its positions) up
   * into an {@link AccountSummary}, delegating to the owning provider so the
   * venue-specific collateral and margin semantics are applied correctly.
   *
   * @public
   */
  getAccountSummary(
    account: AccountResponse,
    positions: Position[]
  ): AccountSummary {
    return this.requireProvider(account.provider).getAccountSummary(
      account,
      positions
    )
  }

  /**
   * Existence check for a provider account at `address`, delegated to the
   * provider plugin's own `accountExists` signal (Hyperliquid probes
   * `preTransferCheck.userExists`; Lighter its `getAccount` → `AccountNotFound`
   * semantics).
   *
   * @throws {PerpsError} When the provider plugin is not registered, or the
   *   plugin's existence probe fails.
   * @public
   */
  async accountExists(provider: string, address: Address): Promise<boolean> {
    return this.requireProvider(provider).accountExists({ address })
  }

  /**
   * The deposit flow for `params.address` at `params.provider`, delegated to the
   * provider plugin — every deposit decision (the collateral destination, the
   * account-opening pipeline, an outstanding setup gate) is venue-owned.
   *
   * @returns `undefined` when the registered plugin declares no deposit flow.
   * @throws {PerpsError} When the provider plugin is not registered, or the
   *   plugin's flow resolution fails.
   * @public
   */
  async getDepositFlow(
    params: GetDepositFlowParams
  ): Promise<DepositFlow | undefined> {
    const plugin = this.requireProvider(params.provider)
    return plugin.getDepositFlow?.({ address: params.address })
  }

  /**
   * The `(asset, route)` selections `params.address` can actually withdraw at
   * `params.provider`. The venue owns how its balances split across routes;
   * this join adds the core `/assets` metadata — precision, L1 identity and
   * the per-asset minimum — and drops every row the minimum rules out, plus
   * any row whose asset the provider's registry does not carry, since without
   * that metadata the amount can be neither scaled nor validated.
   *
   * @returns `undefined` when the registered plugin declares no withdrawable
   *   read.
   * @throws {PerpsError} When the provider plugin is not registered, or either
   *   the plugin read or the asset sync fails.
   * @public
   */
  async getWithdrawableBalances(
    params: GetWithdrawableBalancesParams
  ): Promise<WithdrawableBalance[] | undefined> {
    const plugin = this.requireProvider(params.provider)
    const rows = await plugin.getWithdrawableBalances?.({
      address: params.address,
    })
    if (rows === undefined) {
      return undefined
    }

    const registry = getAssetRegistry(this.sdkClient, params.provider)
    await registry.sync()
    return rows.flatMap((row) => {
      const asset = registry.get(row.assetId)
      if (asset === undefined) {
        return []
      }
      const minimum = asset.minWithdrawalAmount
      if (minimum !== undefined) {
        let floor: Big
        try {
          floor = new Big(minimum)
        } catch {
          throw new PerpsError(
            PerpsErrorCode.SDKError,
            `Asset '${asset.id}' field \`minWithdrawalAmount\` is not a valid decimal.`
          )
        }
        if (new Big(row.available).lt(floor)) {
          return []
        }
      }
      return [{ asset, route: row.route, available: row.available }]
    })
  }

  /**
   * The account's portfolio value and cumulative PnL over `params.range` at
   * `params.provider`, read directly from the venue.
   *
   * @throws {PerpsError} When the provider plugin is not registered, when it
   *   declares no portfolio history read, or when the venue read fails.
   * @public
   */
  async getPortfolioHistory(
    params: GetPortfolioHistoryParams,
    options?: SDKRequestOptions
  ): Promise<PortfolioHistoryResponse> {
    const plugin = this.requireProvider(params.provider)
    if (typeof plugin.getPortfolioHistory !== 'function') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Provider '${params.provider}' does not implement getPortfolioHistory.`
      )
    }
    return plugin.getPortfolioHistory(
      { address: params.address, range: params.range },
      options
    )
  }

  /**
   * Return the setup steps this account must still sign as a flat,
   * self-describing list. Trading is gated on `isReady === true`.
   * `checklist` carries the renderable onboarding list: every choice step and
   * every `USER`-signed step with its satisfied state, with not-required
   * conditional steps omitted.
   *
   * A non-choice `SDK`-signed step is NEVER returned here — the SDK drains it
   * with the provider's own credentials. A choice is listed but never staged:
   * the user picks an option through {@link executeProviderOption}. While an
   * `SDK`-signed choice stays unsatisfied, the SDK executes its `default`
   * option; a `USER`-signed choice is never executed on the user's behalf.
   *
   * @public
   */
  async checkSetup(params: GetSetupParams): Promise<ProviderSetup> {
    const { provider, address } = params

    const metadata = await this.getProviderMetadata(provider)
    const hasSiweSetup = metadata.setup.some(
      (descriptor) => descriptor.signingMethod === SigningMethod.SIWE
    )

    // Gate on existence first: an unfunded account has no setup, so short-circuit
    // before any createAction round-trip and let the consumer prompt a deposit.
    //
    // SIWE-first providers (Ondo) are the exception: they cannot reliably probe
    // account existence before the user signs in, so setup must still stage.
    if (!hasSiweSetup && !(await this.accountExists(provider, address))) {
      return {
        accountExists: false,
        setup: [],
        isReady: false,
        checklist: [],
      }
    }

    const settings = await this.resolveSetupSettings(provider, address)
    const satisfiedSetup = satisfiedTypes(settings)
    const pendingSetup = metadata.setup.filter(
      (descriptor) => !satisfiedSetup.has(descriptor.type)
    )

    const plugin = this.sdkClient.getProvider(provider)

    const stageable = pendingSetup.filter(isStageable)

    // The backend filters already-satisfied setup actions and returns typed
    // data for those still outstanding; each plugin contributes its own
    // signer-bearing request fields.
    const actions = await this.buildProviderSetupActions(
      provider,
      address,
      stageable
    )

    // A staged step is one the build produced actions for — a pending
    // descriptor the backend staged nothing for is either satisfied
    // (backend-gated) or not applicable to this account.
    const stagedTypes = new Set(actions.map((step) => step.action))
    const conditionalTypes = new Set(plugin?.conditionalSetupActions ?? [])
    const checklist = metadata.setup
      .filter(isUserFacingSetupStep)
      .filter(
        (descriptor) =>
          !conditionalTypes.has(descriptor.type) ||
          stagedTypes.has(descriptor.type)
      )
      .sort((a, b) => sequenceOf(a) - sequenceOf(b))
      .map((descriptor) => ({
        descriptor,
        satisfied:
          descriptor.options !== null
            ? satisfiedSetup.has(descriptor.type)
            : !stagedTypes.has(descriptor.type),
        selected: selectedOption(descriptor, settings),
      }))

    await this.drainSetup(
      provider,
      address,
      pendingSetup.filter(isDrainable),
      stageable.filter((descriptor) => stagedTypes.has(descriptor.type))
    )

    return {
      accountExists: true,
      setup: actions,
      isReady: actions.length === 0,
      checklist,
    }
  }

  /**
   * Project the provider's own typed account config onto its setup steps. This
   * catches client-held auth state (e.g. Ondo SIWE/JWT) that the backend
   * cannot observe, and carries the current value of each choice.
   */
  private async resolveSetupSettings(
    provider: string,
    address: Address
  ): Promise<AccountConfigSetting[]> {
    const metadata = await this.getProviderMetadata(provider)
    const plugin = this.sdkClient.getProvider(provider)
    if (!plugin || typeof plugin.getAccount !== 'function') {
      return []
    }
    const account = await plugin.getAccount({ address })
    return plugin.projectConfig(account.config, metadata.setup)
  }

  /**
   * Drain the pending setup steps the SDK fulfils without user input: every
   * `SDK`-signed non-choice step, and every unsatisfied `SDK`-signed choice
   * through its `default` option. A choice executes the option's `{ type,
   * params }` verbatim; a non-choice step is built, signed, and executed in
   * place with the provider's own credentials. A step is deferred while any
   * staged user-facing step with a lower `sequence` is outstanding — it cannot
   * succeed before its prerequisite (e.g. SET_REFERRAL authenticates with the
   * credential REGISTER_API_KEY installs) and each doomed attempt is venue
   * traffic. A drain failure is swallowed so it never blocks setup — the step
   * stays unsatisfied and is retried on a later `checkSetup`.
   */
  private async drainSetup(
    provider: string,
    address: Address,
    drainable: SetupAction[],
    stagedVisible: SetupAction[]
  ): Promise<void> {
    for (const descriptor of drainable) {
      // A tie (equal sequences, or both absent) declares no order, so the
      // drained step defers to the next checkSetup rather than racing.
      const blocked = stagedVisible.some(
        (staged) => sequenceOf(staged) <= sequenceOf(descriptor)
      )
      if (blocked) {
        continue
      }
      try {
        const option = defaultOption(descriptor)
        if (option !== undefined) {
          await this.executeProviderOption({ provider, address, option })
          continue
        }
        const steps = await this.buildProviderSetupActions(provider, address, [
          descriptor,
        ])
        for (const step of steps) {
          const signed = await this.signProviderSetupAction(
            provider,
            address,
            step
          )
          if (signed !== undefined) {
            await this.executeProviderSetup({
              provider,
              address,
              setup: [step],
              signedActions: [signed],
            })
          }
        }
      } catch (error) {
        console.debug(
          `[perps-sdk] setup step '${descriptor.type}' for '${provider}' did not drain; will retry on the next checkSetup.`,
          error
        )
      }
    }
  }

  /**
   * Build unsigned setup steps for the supplied descriptor subset, preserving
   * provider sequence order with SIWE descriptors prioritized.
   */
  private async buildProviderSetupActions(
    provider: string,
    address: Address,
    descriptors: SetupAction[]
  ): Promise<ActionStep[]> {
    const setupPriority = (descriptor: ProviderAction): number =>
      descriptor.signingMethod === SigningMethod.SIWE ? 0 : 1
    const orderedSetup = [...descriptors].sort(
      (a, b) =>
        setupPriority(a) - setupPriority(b) ||
        (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER)
    )

    const plugin = this.sdkClient.getProvider(provider)
    const allActions: ActionStep[] = []
    for (const descriptor of orderedSetup) {
      const action = descriptor.type
      const { signerAddress, params: signerParams } =
        await this.resolveActionRequest(provider, descriptor, address)
      const localParams = plugin?.resolveSetupParams
        ? await plugin.resolveSetupParams(action, address)
        : {}
      const { actions } = await createAction(this.sdkClient, {
        provider,
        address,
        signerAddress,
        action,
        params: {
          ...signerParams,
          ...localParams,
        } as Record<string, never>,
      })
      allActions.push(...actions)
    }

    return allActions
  }

  /**
   * Build the unsigned setup `ActionStep`s still outstanding for an account,
   * ordered by descriptor `sequence`. Only a `USER`-signed non-choice step is
   * staged: an `SDK`-signed step drains inside {@link checkSetup} and a choice
   * executes the option the user picks. The backend filters already-satisfied
   * setup; each plugin contributes its own signer-bearing request fields and
   * any local-state params (e.g. Lighter's known pubkey).
   *
   * @public
   */
  async buildProviderSetup(
    params: BuildProviderSetupParams
  ): Promise<CreateActionResponse> {
    const { provider, address } = params

    const metadata = await this.getProviderMetadata(provider)
    const actions = await this.buildProviderSetupActions(
      provider,
      address,
      metadata.setup.filter(isStageable)
    )
    return { actions }
  }

  /**
   * Submit the signed setup steps returned by `checkSetup` (and signed by the
   * caller / `signProviderSetupAction`). Routes the batch on the first step's
   * action and lets the plugin contribute that action's `signerAddress`.
   * Throws on any per-step venue rejection.
   */
  private async executeProviderSetup(
    params: ExecuteProviderSetupParams
  ): Promise<ExecuteProviderSetupResult> {
    const { provider, address, setup, signedActions } = params

    if (signedActions.length === 0) {
      return { results: { results: [] } }
    }

    const action = setup[0]?.action ?? signedActions[0].action
    const metadata = await this.getProviderMetadata(provider)
    const descriptor = findActionDescriptor(metadata, action)
    const { signerAddress } = await this.resolveActionRequest(
      provider,
      descriptor,
      address
    )

    const response = await executeAction(this.sdkClient, {
      provider,
      address,
      // The submitting account: the plugin-resolved signer (Hyperliquid's
      // agent) when present, else the end-user's address.
      signerAddress: signerAddress ?? address,
      action,
      actions: signedActions,
    })

    const results = this.resolveExplorerLinks(provider, response.results)

    await this.notifyExecuteResults(provider, address, results)

    assertAllSucceeded(results)

    return { results: { results } }
  }

  /**
   * The lowest-`sequence` visible setup step that runs before `descriptor` and
   * is not satisfied, or `undefined` when nothing blocks it. A choice reads its
   * satisfied state from the plugin projection; a non-choice step is satisfied
   * once the provider stages no action for it, so only the earlier steps are
   * staged here.
   */
  private async findBlockingSetupStep(
    provider: string,
    address: Address,
    descriptor: SetupAction
  ): Promise<SetupAction | undefined> {
    const metadata = await this.getProviderMetadata(provider)
    const earlier = metadata.setup
      .filter(
        (d) =>
          isUserFacingSetupStep(d) && sequenceOf(d) < sequenceOf(descriptor)
      )
      .sort((a, b) => sequenceOf(a) - sequenceOf(b))
    if (earlier.length === 0) {
      return undefined
    }

    const satisfiedSetup = satisfiedTypes(
      await this.resolveSetupSettings(provider, address)
    )
    const pending = earlier.filter((d) => !satisfiedSetup.has(d.type))
    if (pending.length === 0) {
      return undefined
    }

    const stageable = pending.filter(isStageable)
    const staged =
      stageable.length === 0
        ? []
        : await this.buildProviderSetupActions(provider, address, stageable)
    const stagedTypes = new Set(staged.map((action) => action.action))
    return pending.find((d) => d.options !== null || stagedTypes.has(d.type))
  }

  /**
   * Sign and submit one pre-staged setup `ActionStep` end-to-end.
   *
   * The caller is expected to have already obtained the step from a prior
   * {@link checkSetup} call (typically cached by the widget's react-query) —
   * we do NOT refetch. This avoids the double `createAction` round-trip and
   * keeps the nonce that was allocated at staging time committed all the way
   * through submit. If the cached step has gone stale (Lighter's `/nextNonce`
   * advanced underneath us), `executeProviderSetup` will surface a nonce
   * conflict that the caller invalidates on, refetches `checkSetup`, and
   * retries with a fresh step.
   *
   * A lower-`sequence` `SDK`-signed choice with a `default` option is executed
   * in place first, so a step `checkSetup` returned behind such a choice stays
   * executable from the cache.
   *
   * @throws {PerpsError} When the step's action is not in the provider's
   *   `setup` descriptors, or when a lower-`sequence` step on the same
   *   checklist is still unsatisfied after that.
   * @public
   */
  async executeProviderSetupAction(params: {
    provider: string
    address: Address
    step: ActionStep
  }): Promise<void> {
    const { provider, address, step } = params

    const metadata = await this.getProviderMetadata(provider)
    const descriptor = metadata.setup.find((d) => d.type === step.action)
    if (!descriptor) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Action '${step.action}' is not in '${provider}'.setup`
      )
    }

    const drained = new Set<ActionType>()
    let blocking = await this.findBlockingSetupStep(
      provider,
      address,
      descriptor
    )
    while (
      blocking !== undefined &&
      isDrainable(blocking) &&
      !drained.has(blocking.type)
    ) {
      drained.add(blocking.type)
      await this.drainSetup(provider, address, [blocking], [])
      blocking = await this.findBlockingSetupStep(provider, address, descriptor)
    }
    if (blocking) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Setup step '${step.action}' for '${provider}' is blocked: '${blocking.type}' runs first and is not satisfied.`
      )
    }

    const signed = await this.signProviderSetupAction(provider, address, step)

    // A client-executed setup action (Lighter SET_REFERRAL) produces no
    // backend-bound step — it already ran during signing, so there is nothing
    // to submit.
    if (signed === undefined) {
      return
    }

    await this.executeProviderSetup({
      provider,
      address,
      setup: [step],
      signedActions: [signed],
    })
  }

  /**
   * Execute one option of a choice setup step (Lighter `ACCOUNT_TYPE`,
   * Hyperliquid `ACCOUNT_MODE`) end-to-end with its bound `{ type, params }`,
   * throwing on a venue rejection.
   *
   * The option runs through the same {@link execute} pipeline as a trade, but
   * a per-action `success: false` (returned as a 200 OK) means the user's
   * selection was rejected and must surface, not be silently dropped.
   *
   * @throws {PerpsError} Carrying the venue error when any returned result has
   *   `success: false`, under that result's `errorCode` when the backend
   *   classified the failure and `PerpsErrorCode.ExchangeRejected` otherwise;
   *   also the errors `execute` itself can throw (unregistered provider, no
   *   signer, signing failure).
   * @public
   */
  async executeProviderOption(params: {
    provider: string
    address: Address
    option: SetupOption
  }): Promise<void> {
    const { provider, address, option } = params
    const { results } = await this.execute({
      provider,
      address,
      action: option.type,
      params: option.params,
    })
    assertAllSucceeded(results)
  }

  /**
   * Undo a satisfied setup step by executing its `revoke` action through
   * create, sign and execute, signed with that action's `Provider.actions`
   * descriptor. The step stages again on the next {@link checkSetup}.
   *
   * @throws {PerpsError} `SDKError` when `step.revoke` is `null`; otherwise
   *   the errors {@link executeProviderOption} throws.
   * @public
   */
  async executeProviderRevoke(params: {
    provider: string
    address: Address
    step: SetupAction
  }): Promise<void> {
    const { provider, address, step } = params
    if (step.revoke === null) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Setup step '${step.type}' for '${provider}' declares no revoke.`
      )
    }
    const { results } = await this.execute({
      provider,
      address,
      action: step.revoke,
      params: {},
    })
    assertAllSucceeded(results)
  }

  /**
   * Place a market or limit order. Convenience wrapper over {@link execute}
   * with `ActionType.PLACE_ORDER`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @example
   * ```ts
   * await client.placeOrder({
   *   provider: 'hyperliquid',
   *   address: '0xUser',
   *   market: { symbol: 'ETH' },
   *   side: 'buy',
   *   size: '0.1',
   * })
   * ```
   * @public
   */
  async placeOrder(params: PlaceOrderParams): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.PLACE_ORDER, params })
  }

  /**
   * Place a trigger (take-profit / stop-loss) order. Convenience wrapper over
   * {@link execute} with `ActionType.PLACE_TRIGGER_ORDER`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async placeTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.PLACE_TRIGGER_ORDER,
      params,
    })
  }

  /**
   * Place a time-weighted average price order through {@link execute}.
   *
   * @public
   */
  async placeTwapOrder(
    params: PlaceTwapOrderParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.PLACE_TWAP_ORDER,
      params,
    })
  }

  /**
   * Cancel a running time-weighted average price order through {@link execute}.
   *
   * @public
   */
  async cancelTwapOrder(
    params: CancelTwapOrderParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.CANCEL_TWAP_ORDER,
      params,
    })
  }

  /**
   * Cancel one or more open orders. Convenience wrapper over {@link execute}
   * with `ActionType.CANCEL_ORDER`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async cancelOrders(
    params: CancelOrdersParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.CANCEL_ORDER, params })
  }

  /**
   * Modify one or more open orders. Convenience wrapper over {@link execute}
   * with `ActionType.MODIFY_ORDER`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async modifyOrders(
    params: ModifyOrdersParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.MODIFY_ORDER, params })
  }

  /**
   * Add or remove isolated-position margin. Convenience wrapper over
   * {@link execute} with `ActionType.UPDATE_POSITION_MARGIN`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async updatePositionMargin(params: {
    provider: string
    address: Address
    market: MarketRef
    action: 'add' | 'remove'
    amount: string
  }): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.UPDATE_POSITION_MARGIN,
      params,
    })
  }

  /**
   * Withdraw funds from the provider account. Convenience wrapper over
   * {@link execute} with `ActionType.WITHDRAWAL`.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async withdraw(params: WithdrawParams): Promise<ExecuteActionResponse> {
    return this.execute({
      provider: params.provider,
      address: params.address,
      action: ActionType.WITHDRAWAL,
      params: params.withdrawal,
    })
  }

  /**
   * Move collateral between DEXes within the provider account. Convenience
   * wrapper over {@link execute} with `ActionType.SEND_ASSET`; like
   * {@link withdraw} it returns the raw {@link ExecuteActionResponse} and does
   * not throw on a venue rejection.
   *
   * @throws {PerpsError} When the provider is unregistered or the action
   *   cannot be signed/submitted.
   * @public
   */
  async sendAsset(
    params: SendAssetActionParams
  ): Promise<ExecuteActionResponse> {
    const { provider, address, ...sendAsset } = params
    return this.execute({
      provider,
      address,
      action: ActionType.SEND_ASSET,
      params: sendAsset,
    })
  }

  /**
   * Execute any action through the SDK's signing pipeline: fetch the unsigned
   * steps, delegate signing to the provider plugin (which branches on the
   * descriptor's scheme and signer internally), and submit. Core stays
   * signer-agnostic — the plugin owns WHO signs and HOW.
   *
   * @throws {PerpsError} When the action is not declared by the provider,
   *   the plugin cannot sign it, or submission fails.
   * @public
   */
  async execute<T extends ActionType>(params: {
    provider: string
    address: Address
    action: T
    params: ActionParamsMap[T]
    /** Progress sink for on-chain legs (e.g. a native deposit's approve then
     * deposit); called as each leg is submitted and confirmed. */
    onProgress?: (progress: SignActionProgress) => void
  }): Promise<ExecuteActionResponse> {
    const { provider, address, action, onProgress } = params
    const metadata = await this.getProviderMetadata(provider)
    const descriptor = findActionDescriptor(metadata, action)

    const { signerAddress, params: signerParams } =
      await this.resolveActionRequest(provider, descriptor, address)

    const { actions } = await createAction(this.sdkClient, {
      provider,
      address,
      signerAddress,
      action,
      params: {
        ...params.params,
        ...signerParams,
      } as ActionParamsMap[T],
    })

    const signedActions = await this.delegateSignActions(
      provider,
      address,
      metadata,
      actions,
      onProgress
    )

    // A plugin may execute an action entirely client-side (e.g. Lighter's
    // token-authenticated venue mutations), leaving no backend-bound step. With
    // nothing to submit, skip the `/executeAction` hop.
    if (signedActions.length === 0) {
      return { results: [] }
    }

    const response = await executeAction(this.sdkClient, {
      provider,
      address,
      // The submitting account: the plugin-resolved signer (Hyperliquid's
      // agent) when present, else the end-user's address.
      signerAddress: signerAddress ?? address,
      action,
      actions: signedActions,
    })

    const results = this.resolveExplorerLinks(provider, response.results)

    await this.notifyExecuteResults(provider, address, results)

    return { results }
  }

  /**
   * Accept the current terms and, when a code is supplied and the backend
   * accepts it, attach that internal referral code — in one signature.
   * Convenience wrapper over {@link executeMetaAction} with
   * `ActionType.META_ONBOARD`.
   *
   * Resolves to `{ results: [] }` when the backend requires no consent from
   * this address.
   *
   * @throws {PerpsError} When no user wallet is configured, or the action
   *   cannot be signed/submitted.
   * @public
   */
  async submitOnboarding(
    params: SubmitOnboardingParams
  ): Promise<ExecuteActionResponse> {
    const { address, ...onboard } = params
    return this.executeMetaAction({
      address,
      action: ActionType.META_ONBOARD,
      params: onboard,
    })
  }

  /**
   * Reserve the shareable internal referral code `address` owns. Convenience
   * wrapper over {@link executeMetaAction} with
   * `ActionType.META_CREATE_REFERRAL_CODE`.
   *
   * @throws {PerpsError} When no user wallet is configured, or the action
   *   cannot be signed/submitted.
   * @public
   */
  async createReferralCode(
    params: CreateReferralCodeActionParams
  ): Promise<ExecuteActionResponse> {
    const { address, ...createCode } = params
    return this.executeMetaAction({
      address,
      action: ActionType.META_CREATE_REFERRAL_CODE,
      params: createCode,
    })
  }

  /**
   * Execute a provider-independent action through the same
   * createAction/executeAction pipeline {@link execute} uses. Meta actions are
   * dispatched with the {@link META_PROVIDER} sentinel: they have no venue
   * plugin and no `ProviderAction` descriptor, so the step is signed as EIP-712
   * typed data with the configured user wallet.
   *
   * The backend returns at most one step. Resolves to `{ results: [] }` when it
   * returns none, meaning no consent is outstanding for this address.
   *
   * @throws {PerpsError} When no user wallet is configured, the backend returns
   *   more than one step or a non-EIP-712 step, or the submitted step reports a
   *   failed result. A signature refusal from the wallet client propagates as
   *   the wallet's own error.
   * @public
   */
  async executeMetaAction<T extends MetaActionType>(
    params: ExecuteMetaActionParams<T>
  ): Promise<ExecuteActionResponse> {
    const { address, action } = params
    const { actions } = await createAction(this.sdkClient, {
      provider: META_PROVIDER,
      address,
      action,
      params: params.params,
    })

    if (actions.length === 0) {
      return { results: [] }
    }
    if (actions.length > 1) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Action '${action}' returned ${actions.length} steps; a meta action carries at most one.`
      )
    }

    const [step] = actions
    if (!('typedData' in step)) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Action '${action}' returned a step without typedData; meta actions are signed as EIP-712 typed data.`
      )
    }

    const wallet = await this.resolveMetaSigningWallet(actions)
    const signature = await signTypedDataWithSigner(wallet, step.typedData)

    const response = await executeAction(this.sdkClient, {
      provider: META_PROVIDER,
      address,
      action,
      actions: [{ ...step, signature }],
    })

    const failure = response.results.find((r) => !r.success)
    if (failure) {
      throw new PerpsError(
        failure.errorCode ?? PerpsErrorCode.ExchangeRejected,
        failure.error
      )
    }

    return response
  }
}
