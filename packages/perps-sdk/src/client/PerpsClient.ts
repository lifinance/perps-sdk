import type {
  AccountResponse,
  AccountSummary,
  ActionParamsMap,
  ActionResult,
  ActionStep,
  CreateActionResponse,
  ExecuteActionResponse,
  MarketRef,
  MarketSettings,
  Position,
  PositionMarginConstraints,
  Provider,
  ProviderAction,
  SignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import Big from 'big.js'
import type { Address } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { getAssetRegistry } from '../registry/assetRegistry.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getAccount as fetchAccount } from '../services/getAccount.js'
import { getProviders } from '../services/getProviders.js'
import type {
  BuildProviderSetupParams,
  CancelOrdersParams,
  CancelTwapOrderParams,
  ExecuteProviderSetupParams,
  ExecuteProviderSetupResult,
  GetAccountResult,
  GetDepositFlowParams,
  GetSetupParams,
  GetWithdrawableBalancesParams,
  ModifyOrdersParams,
  PerpsClientOptions,
  PlaceOrderParams,
  PlaceTriggerOrderParams,
  PlaceTwapOrderParams,
  ProviderSetup,
  SendAssetActionParams,
  WithdrawParams,
} from '../types/api.js'
import type { PerpsClientSigner, SwitchChainHook } from '../types/config.js'
import type { DepositFlow } from '../types/deposit.js'
import type {
  ActionSignerContribution,
  PerpsProvider,
  PerpsSDKClient,
  SignActionProgress,
  SignActionsContext,
} from '../types/provider.js'
import type { WithdrawableBalance } from '../types/withdrawal.js'
import {
  switchSigningChain,
  userEip712TargetChainId,
} from '../utils/switchChain.js'
import { createPerpsClient } from './createPerpsClient.js'
import { requireProvider as resolveProvider } from './requireProvider.js'

/**
 * Look up an action's descriptor in the provider's metadata. Throws if the
 * action isn't declared — defensive: better to fail loudly than to mis-sign.
 */
function findActionDescriptor(
  metadata: Provider,
  action: ActionType
): ProviderAction {
  const descriptor = [
    ...metadata.setup,
    ...metadata.options,
    ...metadata.actions,
  ].find((d) => d.type === action)
  if (!descriptor) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Provider '${metadata.key}' does not declare action '${action}'.`
    )
  }
  return descriptor
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
   * names the user wallet in its `signers` list. Pass undefined to clear.
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
    const cached = this.providerMetadataCache.get(provider)
    if (cached) {
      return cached
    }

    const { providers } = await getProviders(this.sdkClient)
    for (const d of providers) {
      this.providerMetadataCache.set(d.key, d)
    }

    const metadata = this.providerMetadataCache.get(provider)
    if (!metadata) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported provider: ${provider}`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }
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

  /**
   * Ask the provider plugin for the signer-bearing wire fields of `action` —
   * the on-wire `signerAddress` and any signer-derived params (e.g.
   * Hyperliquid's `agentAddress` for `APPROVE_AGENT`). Forwards the descriptor's
   * `signers` so the plugin can branch on signer role. Returns empty when the
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
      descriptor.signers
    )
  }

  /**
   * Delegate signing of `actions` to the provider plugin. The plugin owns
   * every signing arm and branches on the descriptor's `signers` internally,
   * reading the end-user's wallet from the {@link SignActionsContext} when an
   * arm signs as the user.
   */
  private async delegateSignActions(
    provider: string,
    address: Address,
    descriptor: ProviderAction,
    actions: ActionStep[],
    onProgress?: (progress: SignActionProgress) => void
  ): Promise<SignedActionStep[]> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.signActions !== 'function') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Provider '${provider}' does not implement signActions for ` +
          `signingMethod '${descriptor.signingMethod}'.`
      )
    }
    const userWallet = await this.resolveSigningWallet(descriptor, actions)
    return plugin.signActions(
      descriptor.signingMethod,
      actions,
      address,
      this.buildSignActionsContext(descriptor, userWallet, onProgress)
    )
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
   * Assemble the per-call context the provider plugin needs in order to sign:
   * the end-user's wallet and the descriptor's declared `signers`. Core
   * forwards `signers` as data so the plugin can pick WHO signs; it does not
   * branch on them. Provider-owned session credentials (the Hyperliquid agent
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
    const ctx: SignActionsContext = { signers: descriptor.signers }
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
    const descriptor = findActionDescriptor(metadata, step.action)
    const [signed] = await this.delegateSignActions(
      provider,
      address,
      descriptor,
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
   * descriptor on `Provider.setup` + `Provider.options`. Callers read
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
    const settings = plugin.projectConfig(
      response.config,
      metadata.setup,
      metadata.options
    )
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
   * Return the unsatisfied entries on `Provider.setup` for this account as a
   * flat, self-describing list. Trading is gated on `isReady === true`.
   *
   * `Provider.options` descriptors are NEVER returned here — options are
   * post-setup tunables and never gate trading. Option state is surfaced
   * separately via `getAccount().settings`.
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
      return { accountExists: false, setup: [], isReady: false }
    }

    const satisfiedSetup = await this.resolveSatisfiedSetup(provider, address)
    const pendingSetup = metadata.setup.filter(
      (descriptor) => !satisfiedSetup.has(descriptor.type)
    )

    const hiddenSetup = await this.resolveInternalSetup(
      provider,
      address,
      pendingSetup
    )
    const visibleSetup = pendingSetup.filter(
      (descriptor) => !hiddenSetup.has(descriptor.type)
    )

    // The backend filters already-satisfied setup actions and returns typed
    // data for those still outstanding; each plugin contributes its own
    // signer-bearing request fields.
    const actions = await this.buildProviderSetupActions(
      provider,
      address,
      visibleSetup
    )

    return {
      accountExists: true,
      setup: actions,
      isReady: actions.length === 0,
    }
  }

  /**
   * Resolve setup descriptors already satisfied from the provider's own typed
   * account config projection. This catches client-held auth state (e.g. Ondo
   * SIWE/JWT) that the backend cannot observe.
   */
  private async resolveSatisfiedSetup(
    provider: string,
    address: Address
  ): Promise<Set<ActionType>> {
    const metadata = await this.getProviderMetadata(provider)
    const plugin = this.sdkClient.getProvider(provider)
    if (!plugin || typeof plugin.getAccount !== 'function') {
      return new Set()
    }
    const account = await plugin.getAccount({ address })
    const settings = plugin.projectConfig(
      account.config,
      metadata.setup,
      metadata.options
    )
    const setupTypes = new Set(
      metadata.setup.map((descriptor) => descriptor.type)
    )
    return new Set(
      settings
        .filter((setting) => setting.satisfied && setupTypes.has(setting.type))
        .map((setting) => setting.type)
    )
  }

  /**
   * Drain the pending setup steps the provider declares as internal via
   * `PerpsProviderPlugin.internalSetupActions`, returning the set of action
   * types to omit from the caller-facing setup list. Each such step is built,
   * signed, and executed in place with the provider's own credentials. A
   * descriptor whose `signers` include {@link PerpsSigner.USER} is left to
   * render as a normal step. A drain failure is swallowed so it never blocks
   * setup — the step stays unsatisfied and is retried on a later `checkSetup`.
   */
  private async resolveInternalSetup(
    provider: string,
    address: Address,
    pending: ProviderAction[]
  ): Promise<Set<ActionType>> {
    const plugin = this.sdkClient.getProvider(provider)
    const internal = plugin?.internalSetupActions
    if (!internal || internal.length === 0) {
      return new Set()
    }
    const internalTypes = new Set(internal)
    const hidden = new Set<ActionType>()
    for (const descriptor of pending) {
      if (
        !internalTypes.has(descriptor.type) ||
        descriptor.signers.includes(PerpsSigner.USER)
      ) {
        continue
      }
      hidden.add(descriptor.type)
      try {
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
          `[perps-sdk] internal setup step '${descriptor.type}' for '${provider}' did not complete; will retry on the next checkSetup.`,
          error
        )
      }
    }
    return hidden
  }

  /**
   * Build unsigned setup steps for the supplied descriptor subset, preserving
   * provider sequence order with SIWE descriptors prioritized.
   */
  private async buildProviderSetupActions(
    provider: string,
    address: Address,
    descriptors: ProviderAction[]
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
   * ordered by descriptor `sequence`. The backend filters already-satisfied
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
      metadata.setup
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

    const failure = results.find((r) => !r.success)
    if (failure) {
      throw new PerpsError(
        failure.errorCode ?? PerpsErrorCode.ExchangeRejected,
        failure.error
      )
    }

    return { results: { results } }
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
   * @throws {PerpsError} When the step's action is not in the provider's
   *   `setup` descriptors.
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
   * Sign and submit a single provider-option change (a `Provider.options`
   * tunable such as Lighter `ACCOUNT_TYPE` or Hyperliquid `ACCOUNT_MODE`)
   * end-to-end, throwing on a venue rejection.
   *
   * Options are dispatched through the same {@link execute} pipeline as
   * trades, but unlike a trade an option change is a single mandatory action:
   * a per-action `success: false` (returned as a 200 OK) means the user's
   * selection was rejected and must surface, not be silently dropped. This
   * wrapper inspects the result and throws a {@link PerpsError} carrying the
   * venue `error`, giving options the same throw contract that setup has via
   * {@link executeProviderSetupAction}. The only structural difference is that
   * an option carries `params` (the selected value) rather than a pre-staged
   * step.
   *
   * `execute` itself is unchanged — it still returns results without throwing,
   * which the trade hooks rely on for partial-fill handling.
   *
   * @throws {PerpsError} Carrying the venue error when any returned result has
   *   `success: false`, under that result's `errorCode` when the backend
   *   classified the failure and `PerpsErrorCode.ExchangeRejected` otherwise;
   *   also the errors `execute` itself can throw (unregistered provider, no
   *   signer, signing failure).
   * @public
   */
  async executeProviderOption<T extends ActionType>(params: {
    provider: string
    address: Address
    action: T
    params: ActionParamsMap[T]
  }): Promise<void> {
    const { results } = await this.execute(params)
    const failure = results.find((r) => !r.success)
    if (failure) {
      throw new PerpsError(
        failure.errorCode ?? PerpsErrorCode.ExchangeRejected,
        failure.error
      )
    }
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
      descriptor,
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
}
