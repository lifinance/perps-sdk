import type {
  ActionParamsMap,
  ActionStep,
  CreateActionResponse,
  Eip712ActionStep,
  Eip712SignedActionStep,
  ExecuteActionResponse,
  MarketRef,
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
import type { Address } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getAccount as fetchAccount } from '../services/getAccount.js'
import { getProviders } from '../services/getProviders.js'
import type { PerpsProvider, SignActionsContext } from '../types/core.js'
import { requireProvider as resolveProvider } from '../utils/requireProvider.js'
import { signTypedDataWithSigner } from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import type {
  BuildProviderSetupParams,
  CancelOrdersParams,
  ExecuteProviderSetupParams,
  ExecuteProviderSetupResult,
  GetAccountResult,
  GetSetupParams,
  ModifyOrdersParams,
  PerpsClientOptions,
  PlaceOrderParams,
  PlaceTriggerOrderParams,
  ProviderSetup,
  WithdrawParams,
} from './types.js'

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
  private _signer: PerpsSDKClient['signer'] | undefined

  constructor(options: PerpsClientOptions) {
    this.sdkClient = createPerpsClient({
      integrator: options.integrator,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      providers: options.providers,
    })
  }

  /**
   * Set or update the wallet signer. Used whenever an action's descriptor
   * names the user wallet in its `signers` list. Pass undefined to clear.
   *
   * @public
   */
  setSigner(signer: PerpsSDKClient['signer']): void {
    this._signer = signer
    Object.defineProperty(this.sdkClient, 'signer', {
      get: () => this._signer,
      configurable: true,
    })
  }

  /**
   * The underlying low-level {@link PerpsSDKClient} (config, signer, provider
   * registry, agent manager) backing this instance.
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
   * Map the provider's setup gates to bulk-stageable inputs, ordered by
   * `sequence`. Setup descriptors are params-free by contract — input-requiring
   * tunables (ACCOUNT_MODE, ACCOUNT_TYPE) live on `Provider.options` and are
   * dispatched individually via `execute(...)`, never bulk-staged here. The
   * only param injected is the agent address for `APPROVE_AGENT`.
   */
  private buildProviderSetupInputs(
    setup: ProviderAction[],
    agentAddress?: Address
  ): Array<{ key: string; params?: Record<string, unknown> }> {
    return [...setup]
      .sort(
        (a, b) =>
          (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER)
      )
      .map((p) => {
        const params: Record<string, unknown> = {}
        if (p.type === ActionType.APPROVE_AGENT && agentAddress) {
          params.agentAddress = agentAddress
        }
        return {
          key: p.type,
          ...(Object.keys(params).length > 0 ? { params } : {}),
        }
      })
  }

  private async resolveSignerForAction(
    action: ActionType,
    address: Address,
    provider: string
  ): Promise<Address | undefined> {
    // Only AGENT-signed actions surface a distinct signerAddress on the wire.
    // API_KEY signers (e.g. Lighter's LighterKeyStore) are managed per-provider
    // and don't have an EVM address — the backend identifies the action by the
    // L1 `address` instead.
    const metadata = await this.getProviderMetadata(provider)
    const allActions = [
      ...metadata.setup,
      ...metadata.options,
      ...metadata.actions,
    ]
    const descriptor = allActions.find((d) => d.type === action)
    if (!descriptor?.signers.includes(PerpsSigner.AGENT)) {
      return undefined
    }

    return this.resolveAgentSignerAddress(provider, address)
  }

  /**
   * Resolve the registered provider plugin for `provider`, throwing a
   * `PerpsError` when the caller has not registered one via the SDK's
   * `providers` option. The plugin is the only owner of write-side signing
   * for `WASM_BLOB` and `EVM_TX` action arms.
   */
  private requireProvider(provider: string): PerpsProvider {
    return resolveProvider(this.sdkClient, provider)
  }

  /**
   * Resolve the on-wire `signerAddress` for an AGENT-signed action via the
   * provider plugin's session keypair (Hyperliquid's approved agent wallet).
   * Throws when the provider does not own an agent session — only providers
   * whose descriptors name {@link PerpsSigner.AGENT} are expected to.
   */
  private async resolveAgentSignerAddress(
    provider: string,
    address: Address,
    options?: { create?: boolean }
  ): Promise<Address> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.resolveSignerAddress !== 'function') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Provider '${provider}' declares an agent-signed action but does not ` +
          'implement resolveSignerAddress.'
      )
    }
    return plugin.resolveSignerAddress(address, options)
  }

  private async delegateSignActions(
    provider: string,
    address: Address,
    method: SigningMethod,
    actions: ActionStep[],
    ctx: SignActionsContext
  ): Promise<SignedActionStep[]> {
    const plugin = this.requireProvider(provider)
    if (typeof plugin.signActions !== 'function') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Provider '${provider}' does not implement signActions for ` +
          `signingMethod '${method}'.`
      )
    }
    return plugin.signActions(method, actions, address, ctx)
  }

  private async autoSignAndExecute(
    provider: string,
    address: Address,
    action: ActionType,
    actions: ActionStep[],
    descriptor: ProviderAction
  ): Promise<ExecuteActionResponse> {
    switch (descriptor.signingMethod) {
      case SigningMethod.EIP712: {
        const eip712Actions = actions as Eip712ActionStep[]

        if (descriptor.signers.includes(PerpsSigner.AGENT)) {
          const signerAddress = await this.resolveAgentSignerAddress(
            provider,
            address
          )
          const signedActions = await this.delegateSignActions(
            provider,
            address,
            SigningMethod.EIP712,
            eip712Actions,
            {}
          )
          return executeAction(this.sdkClient, {
            provider,
            address,
            signerAddress,
            action,
            actions: signedActions,
          })
        }

        if (descriptor.signers.includes(PerpsSigner.USER)) {
          const signer = this.sdkClient.signer
          if (!signer) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Action '${action}' requires a user-wallet signature, but no signer was configured. Pass a WalletClient to createPerpsClient({ signer }).`
            )
          }
          const signedActions: SignedActionStep[] = await Promise.all(
            eip712Actions.map(
              async (a) =>
                ({
                  action: a.action,
                  typedData: a.typedData,
                  signature: await signTypedDataWithSigner(signer, a.typedData),
                }) satisfies Eip712SignedActionStep
            )
          )
          return executeAction(this.sdkClient, {
            provider,
            address,
            signerAddress: address,
            action,
            actions: signedActions,
          })
        }

        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `Action '${action}' descriptor names no supported signer (signers=[${descriptor.signers.join(', ')}]).`
        )
      }

      case SigningMethod.WASM_BLOB:
      case SigningMethod.EVM_TX: {
        const ctx = this.buildSignActionsContext()
        const signedActions = await this.delegateSignActions(
          provider,
          address,
          descriptor.signingMethod,
          actions,
          ctx
        )
        return executeAction(this.sdkClient, {
          provider,
          address,
          signerAddress: address,
          action,
          actions: signedActions,
        })
      }

      default:
        throw new Error(`Unknown signingMethod: ${descriptor.signingMethod}`)
    }
  }

  /**
   * Assemble the per-call context the provider plugin needs in order to sign:
   * the configured wallet signer. Provider-owned session credentials (the
   * Hyperliquid agent keypair, Lighter's API key) are resolved inside the
   * provider's `signActions`, not threaded through here.
   */
  private buildSignActionsContext(): SignActionsContext {
    const ctx: SignActionsContext = {}
    if (this.sdkClient.signer !== undefined) {
      ctx.signer = this.sdkClient.signer
    }
    return ctx
  }

  /**
   * Sign a single provider setup action step using whichever signing path matches the
   * step's shape — EIP-712 typed data, WASM blob (with the hybrid EIP-191 +
   * WASM flow for REGISTER_API_KEY), or EVM transaction. Lets consumers
   * collect signed setup actions without embedding per-method signing logic.
   *
   * @throws {PerpsError} When an EIP-712 step is passed with no wallet signer
   *   configured, or the step shape is unrecognised.
   * @public
   */
  async signProviderSetupAction(
    provider: string,
    address: Address,
    step: ActionStep
  ): Promise<SignedActionStep> {
    if ('typedData' in step) {
      if (!this.sdkClient.signer) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'EIP-712 provider setup action signing requires a wallet signer. Pass ' +
            '`signer` to createPerpsClient or call setSigner(walletClient).'
        )
      }
      return {
        action: step.action,
        typedData: step.typedData,
        signature: await signTypedDataWithSigner(
          this.sdkClient.signer,
          step.typedData
        ),
      } satisfies Eip712SignedActionStep
    }
    const method =
      'wasmSignParams' in step
        ? SigningMethod.WASM_BLOB
        : 'txParams' in step
          ? SigningMethod.EVM_TX
          : undefined
    if (method === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Unknown ActionStep shape — expected typedData, wasmSignParams, or txParams.'
      )
    }
    const [signed] = await this.delegateSignActions(
      provider,
      address,
      method,
      [step],
      this.buildSignActionsContext()
    )
    return signed
  }

  /**
   * Build (but do not sign or submit) the unsigned action steps for `action`,
   * resolving the agent signer address for AGENT-signed actions.
   *
   * @public
   */
  async buildAction<T extends keyof ActionParamsMap>(
    action: T,
    params: { provider: string; address: Address; params: ActionParamsMap[T] }
  ): Promise<CreateActionResponse> {
    const signerAddress = await this.resolveSignerForAction(
      action,
      params.address,
      params.provider
    )
    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action,
      params: params.params,
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
   * Thin existence check for a provider account at `address`. Returns
   * `true` when `getAccount` resolves, `false` when the backend reports
   * `PerpsErrorCode.AccountNotFound`, and re-throws on any other error
   * (transport failures, validation errors, server errors).
   *
   * @throws {PerpsError} On any backend error other than
   *   `PerpsErrorCode.AccountNotFound`.
   * @public
   */
  async accountExists(provider: string, address: Address): Promise<boolean> {
    try {
      await fetchAccount(this.sdkClient, { provider, address })
      return true
    } catch (err) {
      if (
        err instanceof PerpsError &&
        err.code === PerpsErrorCode.AccountNotFound
      ) {
        return false
      }
      throw err
    }
  }

  /**
   * Return the unsatisfied entries on `Provider.setup` for this account,
   * split by signer role. Trading is gated on `isReady === true`.
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
    const usesAgent = [
      ...metadata.setup,
      ...metadata.options,
      ...metadata.actions,
    ].some((d) => d.signers.includes(PerpsSigner.AGENT))

    let agentAddress: Address | undefined
    if (usesAgent) {
      agentAddress = await this.resolveAgentSignerAddress(provider, address, {
        create: true,
      })
    }

    const allInputs = this.buildProviderSetupInputs(
      metadata.setup,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userProviderSetup: [], agentProviderSetup: [], isReady: true }
    }

    const signersByAction = new Map<string, PerpsSigner[]>()
    for (const desc of metadata.setup) {
      signersByAction.set(desc.type, desc.signers)
    }

    // The backend filters already-satisfied setup actions and returns typed data.
    const { actions } = await this.buildProviderSetup({
      provider,
      address,
      signerAddress: agentAddress,
    })

    if (actions.length === 0) {
      return { userProviderSetup: [], agentProviderSetup: [], isReady: true }
    }

    const userProviderSetup = actions.filter((a) => {
      const signers = signersByAction.get(a.action) ?? []
      return signers.includes(PerpsSigner.USER)
    })
    const agentProviderSetup = actions.filter((a) => {
      const signers = signersByAction.get(a.action) ?? []
      return signers.includes(PerpsSigner.AGENT)
    })

    return {
      userProviderSetup,
      agentProviderSetup,
      isReady: false,
    }
  }

  /**
   * Build the unsigned setup `ActionStep`s still outstanding for an account,
   * ordered by descriptor `sequence`. The backend filters already-satisfied
   * setup; each plugin may contribute params from its local state.
   *
   * @public
   */
  async buildProviderSetup(
    params: BuildProviderSetupParams
  ): Promise<CreateActionResponse> {
    let { signerAddress } = params

    if (!signerAddress) {
      signerAddress = await this.resolveAgentSignerAddress(
        params.provider,
        params.address
      )
    }

    const metadata = await this.getProviderMetadata(params.provider)
    const allInputs = this.buildProviderSetupInputs(
      metadata.setup,
      signerAddress
    )

    // The backend filters already-satisfied provider setup and returns the
    // unsigned action steps for those still outstanding. The plugin gets one
    // chance per input to contribute params from its local state (e.g.
    // Lighter's known local pubkey, which gates the backend's idempotency).
    const plugin = this.sdkClient.getProvider(params.provider)
    const allActions: ActionStep[] = []
    for (const input of allInputs) {
      const action = input.key as keyof ActionParamsMap
      const pluginParams = plugin?.resolveSetupParams
        ? await plugin.resolveSetupParams(action, params.address)
        : {}
      const { actions } = await createAction(this.sdkClient, {
        provider: params.provider,
        address: params.address,
        signerAddress,
        action,
        params: {
          ...(input.params ?? {}),
          ...pluginParams,
        } as Record<string, never>,
      })
      allActions.push(...actions)
    }

    return { actions: allActions }
  }

  /**
   * Submit the signed setup steps returned by `checkSetup` (and seeded
   * with user-wallet signatures by the caller). Internally splits into:
   *
   *   1. Submit user-signed setup actions.
   *   2. Sign and submit any pre-staged agent-side setup actions the
   *      backend returned alongside the user-signed ones.
   *
   * @public
   */
  async executeProviderSetup(
    params: ExecuteProviderSetupParams
  ): Promise<ExecuteProviderSetupResult> {
    const { provider, address, required, userSignedActions } = params

    let userResults: ExecuteActionResponse = { results: [] }
    if (userSignedActions.length > 0) {
      const signerAddress = await this.resolveAgentSignerAddress(
        provider,
        address
      )

      // Route the batch on the first action's type.
      const firstAction = required.userProviderSetup[0]?.action as string
      userResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress,
        action: (firstAction ?? ActionType.APPROVE_AGENT) as ActionType,
        actions: userSignedActions,
      })

      const mandatoryFailure = userResults.results.find((r) => !r.success)
      if (mandatoryFailure) {
        throw new PerpsError(
          PerpsErrorCode.ExchangeRejected,
          mandatoryFailure.error
        )
      }
    }

    let agentResults: ExecuteActionResponse | undefined

    // Sign and submit any pre-staged agent provider setup returned by the
    // backend's `buildProviderSetup` call. ACCOUNT_MODE is filtered out of
    // bulk staging (it requires explicit `mode` params), so this block today
    // only runs for future agent-signed steps the backend chooses to stage.
    if (required.agentProviderSetup.length > 0) {
      const signerAddress = await this.resolveAgentSignerAddress(
        provider,
        address
      )

      const signedAgentActions = await this.delegateSignActions(
        provider,
        address,
        SigningMethod.EIP712,
        required.agentProviderSetup,
        {}
      )

      const firstAction = required.agentProviderSetup[0]?.action as string
      const stagedResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress,
        action: (firstAction ?? ActionType.ACCOUNT_MODE) as ActionType,
        actions: signedAgentActions,
      })

      agentResults = {
        results: [...(agentResults?.results ?? []), ...stagedResults.results],
      }
    }

    return {
      userResults,
      ...(agentResults ? { agentResults } : {}),
    }
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
   * Signer-role split: looks up the action's setup descriptor and dispatches
   * to `signProviderSetupAction` for user-signed steps; agent steps are
   * auto-signed inside `executeProviderSetup`.
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
    const isUserStep = descriptor.signers.includes(PerpsSigner.USER)

    let userSignedActions: SignedActionStep[] = []
    if (isUserStep) {
      const signed = await this.signProviderSetupAction(provider, address, step)
      userSignedActions = [signed]
    }

    const singleStep: ProviderSetup = {
      userProviderSetup: isUserStep ? [step] : [],
      agentProviderSetup: isUserStep ? [] : [step],
      isReady: false,
    }
    await this.executeProviderSetup({
      provider,
      address,
      required: singleStep,
      userSignedActions,
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
   * @throws {PerpsError} `PerpsErrorCode.ExchangeRejected` carrying the venue
   *   error when any returned result has `success: false`; also the errors
   *   `execute` itself can throw (unregistered provider, no signer, signing
   *   failure).
   * @public
   */
  async executeProviderOption<T extends keyof ActionParamsMap>(params: {
    provider: string
    address: Address
    action: T
    params: ActionParamsMap[T]
  }): Promise<void> {
    const { results } = await this.execute(params)
    const failure = results.find((r) => !r.success)
    if (failure) {
      throw new PerpsError(PerpsErrorCode.ExchangeRejected, failure.error)
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
   * Execute any action through the SDK's signing pipeline. The
   * action's descriptor in provider metadata picks the route:
   * `EIP712` is signed inside `PerpsClient` against the agent or user
   * wallet; `WASM_BLOB` and `EVM_TX` are delegated to the provider
   * plugin's {@link PerpsProvider.signActions}.
   *
   * @throws {PerpsError} When the action is not declared by the provider,
   *   no matching signer is configured, or signing/submission fails.
   * @public
   */
  async execute<T extends keyof ActionParamsMap>(params: {
    provider: string
    address: Address
    signerAddress?: Address
    action: T
    params: ActionParamsMap[T]
  }): Promise<ExecuteActionResponse> {
    const metadata = await this.getProviderMetadata(params.provider)
    const descriptor = findActionDescriptor(metadata, params.action)

    const { actions } = await this.buildAction(params.action, {
      provider: params.provider,
      address: params.address,
      params: params.params,
    })
    return await this.autoSignAndExecute(
      params.provider,
      params.address,
      params.action,
      actions,
      descriptor
    )
  }
}
