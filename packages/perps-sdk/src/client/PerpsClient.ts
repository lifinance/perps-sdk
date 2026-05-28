import type {
  ActionParamsMap,
  ActionStep,
  AssetIdentity,
  CreateActionResponse,
  Eip712ActionStep,
  Eip712SignedActionStep,
  ExecuteActionResponse,
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
import { localStorageAdapter } from '../agent/storage.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getAccount as fetchAccount } from '../services/getAccount.js'
import { getProviders } from '../services/getProviders.js'
import type { PerpsProvider, SignActionsContext } from '../types/core.js'
import { requireProvider as resolveProvider } from '../utils/requireProvider.js'
import {
  signTypedData,
  signTypedDataWithSigner,
} from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import {
  type BuildProviderSetupParams,
  type CancelOrdersParams,
  type ExecuteProviderSetupParams,
  type ExecuteProviderSetupResult,
  type GetAccountResult,
  type GetSetupParams,
  type ModifyOrdersParams,
  type PerpsClientOptions,
  type PlaceOrderParams,
  type PlaceTriggerOrderParams,
  type ProviderSetup,
  SigningMode,
  type WithdrawParams,
} from './types.js'

const MAX_NONCE_RETRIES = 3

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

export class PerpsClient {
  private sdkClient: PerpsSDKClient
  private storage: StorageAdapter
  private signingModes: Map<string, SigningMode> = new Map()
  private providerMetadataCache: Map<string, Provider> = new Map()
  private _signer: PerpsSDKClient['signer'] | undefined

  constructor(options: PerpsClientOptions) {
    this.storage = options.storage ?? localStorageAdapter
    this.sdkClient = createPerpsClient({
      integrator: options.integrator,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      storage: this.storage,
      providers: options.providers,
    })
  }

  /**
   * Set or update the wallet signer. Used whenever an action's descriptor
   * names the user wallet in its `signers` list. Pass undefined to clear.
   */
  setSigner(signer: PerpsSDKClient['signer']): void {
    this._signer = signer
    // Override the signer on the sdkClient
    Object.defineProperty(this.sdkClient, 'signer', {
      get: () => this._signer,
      configurable: true,
    })
  }

  get client(): PerpsSDKClient {
    return this.sdkClient
  }

  private modeKey(address: Address, provider: string): string {
    return `${address.toLowerCase()}:${provider.toLowerCase()}`
  }

  private signingModeStorageKey(address: Address, provider: string): string {
    return `lifi-perps-mode:${address.toLowerCase()}:${provider.toLowerCase()}`
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
   * Action types that require explicit user input (a chosen mode or tier)
   * and therefore cannot be bulk-staged through `buildProviderSetup` with
   * empty params. Callers must dispatch these via `execute(...)` once a
   * value is picked. The post-`APPROVE_AGENT` auto-upgrade path also
   * dispatches `ACCOUNT_MODE` directly with `mode: 'unifiedAccount'`.
   */
  private static readonly EXPLICIT_INPUT_SETUP_ACTIONS: ReadonlySet<ActionType> =
    new Set([ActionType.ACCOUNT_MODE, ActionType.ACCOUNT_TYPE])

  private buildProviderSetupInputs(
    setup: ProviderAction[],
    mode: SigningMode,
    agentAddress?: Address
  ): Array<{ key: string; params?: Record<string, unknown> }> {
    return [...setup]
      .sort(
        (a, b) =>
          (a.sequence ?? Number.MAX_SAFE_INTEGER) -
          (b.sequence ?? Number.MAX_SAFE_INTEGER)
      )
      .filter((p) => {
        // ACCOUNT_MODE / ACCOUNT_TYPE require explicit params; they're
        // dispatched separately via `execute(...)` (or the post-APPROVE_AGENT
        // auto-upgrade chain) rather than bulk-staged.
        if (PerpsClient.EXPLICIT_INPUT_SETUP_ACTIONS.has(p.type)) {
          return false
        }
        if (mode === SigningMode.USER) {
          // USER mode: only items the user can sign, and never APPROVE_AGENT
          // (no agent is created in this mode).
          if (!p.signers.includes(PerpsSigner.USER)) {
            return false
          }
          if (p.type === ActionType.APPROVE_AGENT) {
            return false
          }
          return true
        }
        // USER_AGENT mode: include every remaining declared provider setup action.
        return true
      })
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
    const mode = await this.loadSigningMode(address, provider)
    if (mode !== SigningMode.USER_AGENT) {
      return undefined
    }

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

    const agent = await this.sdkClient.agentManager.getAgent(address, provider)
    return agent.address
  }

  /**
   * True if any descriptor for the provider lists `PerpsSigner.AGENT`.
   * Providers like Lighter sign with their own keystore and never need an
   * AgentManager-managed agent.
   */
  private async providerUsesAgent(provider: string): Promise<boolean> {
    const metadata = await this.getProviderMetadata(provider)
    const all = [...metadata.setup, ...metadata.options, ...metadata.actions]
    return all.some((d) => d.signers.includes(PerpsSigner.AGENT))
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
          const agent = await this.sdkClient.agentManager.getAgent(
            address,
            provider
          )
          const signedActions: SignedActionStep[] = await Promise.all(
            eip712Actions.map(
              async (a) =>
                ({
                  action: a.action,
                  typedData: a.typedData,
                  signature: await signTypedData(agent.privateKey, a.typedData),
                }) satisfies Eip712SignedActionStep
            )
          )
          return executeAction(this.sdkClient, {
            provider,
            address,
            signerAddress: agent.address,
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
        const ctx = await this.buildSignActionsContext(
          provider,
          address,
          descriptor
        )
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
   * Assemble the per-call context the provider plugin needs in order to
   * sign. Today this is the wallet signer (when configured) and the
   * agent keypair (when the descriptor includes `PerpsSigner.AGENT` and
   * the signing mode requires it).
   */
  private async buildSignActionsContext(
    provider: string,
    address: Address,
    descriptor: ProviderAction
  ): Promise<SignActionsContext> {
    const ctx: SignActionsContext = {}
    if (this.sdkClient.signer !== undefined) {
      ctx.signer = this.sdkClient.signer
    }
    if (descriptor.signers.includes(PerpsSigner.AGENT)) {
      const mode = await this.loadSigningMode(address, provider)
      if (mode === SigningMode.USER_AGENT) {
        ctx.agent = await this.sdkClient.agentManager.getAgent(
          address,
          provider
        )
      }
    }
    return ctx
  }

  /**
   * Sign a single provider setup action step using whichever signing path matches the
   * step's shape — EIP-712 typed data, WASM blob (with the hybrid EIP-191 +
   * WASM flow for REGISTER_API_KEY), or EVM transaction. Lets consumers
   * collect signed setup actions without embedding per-method signing logic.
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
    const ctx: SignActionsContext = {}
    if (this.sdkClient.signer !== undefined) {
      ctx.signer = this.sdkClient.signer
    }
    const [signed] = await this.delegateSignActions(
      provider,
      address,
      method,
      [step],
      ctx
    )
    return signed
  }

  // ---------------------------------------------------------------------------
  // Generic action helpers
  // ---------------------------------------------------------------------------

  async buildAction<T extends ActionType>(
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

  // ---------------------------------------------------------------------------
  // Signing mode management
  // ---------------------------------------------------------------------------

  async setSigningMode(
    address: Address,
    provider: string,
    mode: SigningMode
  ): Promise<void> {
    const key = this.modeKey(address, provider)
    this.signingModes.set(key, mode)
    await this.storage.set(this.signingModeStorageKey(address, provider), mode)
    if (
      mode === SigningMode.USER_AGENT &&
      (await this.providerUsesAgent(provider))
    ) {
      await this.sdkClient.agentManager.getOrCreateAgent(address, provider)
    }
  }

  getSigningMode(address: Address, provider: string): SigningMode {
    return (
      this.signingModes.get(this.modeKey(address, provider)) ??
      SigningMode.USER_AGENT
    )
  }

  async loadSigningMode(
    address: Address,
    provider: string
  ): Promise<SigningMode> {
    const key = this.modeKey(address, provider)
    if (this.signingModes.has(key)) {
      return this.signingModes.get(key)!
    }

    const stored = await this.storage.get(
      this.signingModeStorageKey(address, provider)
    )
    const mode: SigningMode =
      stored === SigningMode.USER_AGENT || stored === SigningMode.USER
        ? stored
        : SigningMode.USER_AGENT
    this.signingModes.set(key, mode)
    return mode
  }

  async loadAgentMode(address: Address, provider: string): Promise<boolean> {
    const mode = await this.loadSigningMode(address, provider)
    return mode === SigningMode.USER_AGENT
  }

  async setAgentMode(
    address: Address,
    provider: string,
    useAgent: boolean
  ): Promise<void> {
    await this.setSigningMode(
      address,
      provider,
      useAgent ? SigningMode.USER_AGENT : SigningMode.USER
    )
  }

  async getAgentAddress(address: Address, provider: string): Promise<Address> {
    const agent = await this.sdkClient.agentManager.getAgent(address, provider)
    return agent.address
  }

  async hasAgent(address: Address, provider: string): Promise<boolean> {
    return this.sdkClient.agentManager.hasAgent(address, provider)
  }

  async removeAgent(address: Address, provider: string): Promise<void> {
    await this.sdkClient.agentManager.removeAgent(address, provider)
    this.signingModes.delete(this.modeKey(address, provider))
    await this.storage.remove(this.signingModeStorageKey(address, provider))
  }

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------

  /**
   * Fetch the user's account state from the backend and attach the
   * SDK-projected `settings` array — one `AccountConfigSetting` per
   * descriptor on `Provider.setup` + `Provider.options`. Callers read
   * `result.settings` directly without re-deriving values from the typed
   * `AccountConfig`.
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

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /**
   * Return the unsatisfied entries on `Provider.setup` for this account,
   * split by signer role. Trading is gated on `isReady === true`.
   *
   * `Provider.options` descriptors are NEVER returned here — options are
   * post-setup tunables and never gate trading. Option state is surfaced
   * separately via `getAccount().settings`.
   */
  async checkSetup(params: GetSetupParams): Promise<ProviderSetup> {
    const { provider, address } = params
    const mode = await this.loadSigningMode(address, provider)

    const metadata = await this.getProviderMetadata(provider)
    const usesAgent = [
      ...metadata.setup,
      ...metadata.options,
      ...metadata.actions,
    ].some((d) => d.signers.includes(PerpsSigner.AGENT))

    let agentAddress: Address | undefined
    if (mode === SigningMode.USER_AGENT && usesAgent) {
      const agent = await this.sdkClient.agentManager.getOrCreateAgent(
        address,
        provider
      )
      agentAddress = agent.address
    }

    const allInputs = this.buildProviderSetupInputs(
      metadata.setup,
      mode,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userProviderSetup: [], agentProviderSetup: [], isReady: true }
    }

    // Build a signer lookup from setup descriptors.
    const signersByAction = new Map<string, PerpsSigner[]>()
    for (const desc of metadata.setup) {
      signersByAction.set(desc.type, desc.signers)
    }

    // Send all to backend via createAction for the first provider setup action type
    // The backend filters already-satisfied ones and returns typed data
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

  async buildProviderSetup(
    params: BuildProviderSetupParams
  ): Promise<CreateActionResponse> {
    const mode = await this.loadSigningMode(params.address, params.provider)
    let { signerAddress } = params

    if (mode === SigningMode.USER_AGENT && !signerAddress) {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.provider
      )
      signerAddress = agent.address
    }

    const metadata = await this.getProviderMetadata(params.provider)
    const allInputs = this.buildProviderSetupInputs(
      metadata.setup,
      mode,
      signerAddress
    )

    // The backend filters already-satisfied provider setup and returns the
    // unsigned action steps for those still outstanding. The plugin gets one
    // chance per input to contribute params from its local state (e.g.
    // Lighter's known local pubkey, which gates the backend's idempotency).
    const plugin = this.sdkClient.getProvider(params.provider)
    const allActions: ActionStep[] = []
    for (const input of allInputs) {
      const action = input.key as ActionType
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
   * Default mode the SDK auto-applies after `APPROVE_AGENT` on a provider
   * whose `options` array exposes a writable `ACCOUNT_MODE` (today
   * Hyperliquid). Callers can override this through a subsequent
   * `ACCOUNT_MODE` dispatch.
   */
  private static readonly DEFAULT_ACCOUNT_MODE = 'unifiedAccount'

  /**
   * Prepare an `ACCOUNT_MODE` change by proactively reading the account's
   * current `config.abstractionMode` and routing to the correct signer:
   *
   * - `abstractionMode == null` (never set, e.g. a fresh HL account):
   *   the change MAY be performed by the agent signer. Build, sign with
   *   the agent key, and dispatch. Returns `{ results }`.
   * - `abstractionMode === mode`: idempotent no-op. Returns an empty
   *   results envelope without contacting `/createAction` or `/executeAction`.
   * - `abstractionMode` set to any other value: HL requires a user-wallet
   *   signature to change the abstraction once it has been set. Build the
   *   action unsigned and return it as `{ fallback }` so the caller can
   *   surface a wallet prompt via `fallbackUserProviderSetup`.
   *
   * Network errors from `/account` propagate — we never guess the signer.
   * `account.config.provider !== 'hyperliquid'` also throws: this helper
   * is HL-specific and the dispatcher should never reach it for another
   * provider (gated by `hasWritableAccountMode`).
   */
  private async prepareAccountModeChange(
    provider: string,
    address: Address,
    mode: string
  ): Promise<{
    results?: ExecuteActionResponse
    fallback?: ActionStep[]
  }> {
    const account = await fetchAccount(this.sdkClient, { provider, address })
    if (account.config.provider !== 'hyperliquid') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `prepareAccountModeChange is Hyperliquid-specific, but ` +
          `getAccount returned config for provider ` +
          `'${account.config.provider}'.`
      )
    }
    const currentStatus = account.config.abstractionMode

    // Idempotent short-circuit: already in the requested mode.
    if (currentStatus === mode) {
      return {}
    }

    // Never set → the agent is authorised to perform the change.
    if (currentStatus == null) {
      const agent = await this.sdkClient.agentManager.getAgent(
        address,
        provider
      )

      const { actions } = await createAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: ActionType.ACCOUNT_MODE,
        params: { mode } satisfies ActionParamsMap[ActionType.ACCOUNT_MODE],
      })

      if (actions.length === 0) {
        // Backend's per-mode early-exit (defensive — shouldn't fire given
        // the short-circuit above, but covers a race between our /account
        // read and the backend's view of the current status).
        return { results: { results: [] } }
      }

      const signedActions: SignedActionStep[] = await Promise.all(
        (actions as Eip712ActionStep[]).map(
          async (a): Promise<Eip712SignedActionStep> => ({
            action: a.action,
            typedData: a.typedData,
            signature: await signTypedData(agent.privateKey, a.typedData),
          })
        )
      )

      const results = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: ActionType.ACCOUNT_MODE,
        actions: signedActions,
      })

      return { results }
    }

    // Already set to a different mode → HL requires a user-wallet signature.
    // Build the action unsigned and surface it as a fallback to the caller.
    const { actions: fallbackActions } = await createAction(this.sdkClient, {
      provider,
      address,
      action: ActionType.ACCOUNT_MODE,
      params: { mode } satisfies ActionParamsMap[ActionType.ACCOUNT_MODE],
    })

    return {
      fallback: fallbackActions.length > 0 ? fallbackActions : undefined,
    }
  }

  /**
   * True when the provider exposes an `ACCOUNT_MODE` descriptor (in `setup`
   * or `options`) whose `mode` Param has a writable enumeration of values.
   * Providers that omit `ACCOUNT_MODE` or expose it as read-only / free-form
   * input return false.
   */
  private static hasWritableAccountMode(metadata: Provider): boolean {
    const item = [...metadata.setup, ...metadata.options].find(
      (i) => i.type === ActionType.ACCOUNT_MODE
    )
    if (!item) {
      return false
    }
    const modeParam = item.params?.find((p) => p.name === 'mode')
    if (!modeParam) {
      return false
    }
    // Writable multi-option: `values` enumerates choices and `readOnly`
    // is not set (treat absence as writable, matching the descriptor
    // contract in `Param`).
    if (!modeParam.values || modeParam.values.length === 0) {
      return false
    }
    return !modeParam.readOnly
  }

  /**
   * Submit the signed setup steps returned by `checkSetup` (and seeded
   * with user-wallet signatures by the caller). Internally splits into:
   *
   *   1. Submit user-signed setup actions.
   *   2. After a successful `APPROVE_AGENT`, auto-upgrade `ACCOUNT_MODE`
   *      to the SDK's default when the provider exposes a writable
   *      `ACCOUNT_MODE` Param (Hyperliquid today). The SDK reads
   *      `account.config.abstractionMode` to choose the signer: `null` →
   *      agent dispatch; non-null → wallet fallback returned in
   *      `fallbackUserProviderSetup`.
   *   3. Sign and submit any pre-staged agent-side setup actions the
   *      backend returned alongside the user-signed ones.
   */
  async executeProviderSetup(
    params: ExecuteProviderSetupParams
  ): Promise<ExecuteProviderSetupResult> {
    const { provider, address, required, userSignedActions } = params
    const mode = await this.loadSigningMode(address, provider)

    // 1. Submit user-signed provider setup
    let userResults: ExecuteActionResponse = { results: [] }
    if (userSignedActions.length > 0) {
      const signerAddress =
        mode === SigningMode.USER_AGENT
          ? (await this.sdkClient.agentManager.getAgent(address, provider))
              .address
          : address

      // Submit all user-signed actions — use first action's type for routing
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
        return { userResults }
      }
    }

    // 2. Auto-upgrade ACCOUNT_MODE after APPROVE_AGENT.
    //
    // When the user-signed setup included a successful APPROVE_AGENT, the
    // freshly approved agent is now authorised to sign account-level
    // actions for accounts whose abstraction has never been set. If the
    // provider exposes a writable `ACCOUNT_MODE` descriptor (Hyperliquid
    // today), the SDK reads `account.config.abstractionMode` to decide
    // the signer: `null` → agent-dispatch silently to the SDK's preferred
    // default; non-null → return a wallet-signing fallback step. Either
    // way the chain does NOT abort onboarding — `ACCOUNT_MODE` lives on
    // `Provider.options`, not `Provider.setup`, and so does not gate
    // trading.
    let agentResults: ExecuteActionResponse | undefined
    let fallbackUserProviderSetup: ActionStep[] | undefined
    if (mode === SigningMode.USER_AGENT) {
      const justApprovedAgent = userResults.results.some(
        (r) => r.success && r.action === ActionType.APPROVE_AGENT
      )
      if (justApprovedAgent) {
        const metadata = await this.getProviderMetadata(provider)
        if (PerpsClient.hasWritableAccountMode(metadata)) {
          const upgrade = await this.prepareAccountModeChange(
            provider,
            address,
            PerpsClient.DEFAULT_ACCOUNT_MODE
          )
          agentResults = upgrade.results
          fallbackUserProviderSetup = upgrade.fallback
        }
      }
    }

    // 3. Sign and submit any pre-staged agent provider setup returned by the
    //    backend's `buildProviderSetup` call. ACCOUNT_MODE is filtered out of
    //    bulk staging (it requires explicit `mode` params), so this block
    //    today only runs for future agent-signed steps the backend chooses
    //    to stage.
    if (
      required.agentProviderSetup.length > 0 &&
      mode === SigningMode.USER_AGENT
    ) {
      const agent = await this.sdkClient.agentManager.getAgent(
        address,
        provider
      )

      const signedAgentActions: SignedActionStep[] = await Promise.all(
        (required.agentProviderSetup as Eip712ActionStep[]).map(
          async (action) =>
            ({
              action: action.action,
              typedData: action.typedData,
              signature: await signTypedData(
                agent.privateKey,
                action.typedData
              ),
            }) satisfies Eip712SignedActionStep
        )
      )

      const firstAction = required.agentProviderSetup[0]?.action as string
      const stagedResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: (firstAction ?? ActionType.ACCOUNT_MODE) as ActionType,
        actions: signedAgentActions,
      })

      // Merge staged-setup action results with any auto-upgrade results from step 2.
      agentResults = {
        results: [...(agentResults?.results ?? []), ...stagedResults.results],
      }
    }

    return {
      userResults,
      ...(agentResults ? { agentResults } : {}),
      ...(fallbackUserProviderSetup ? { fallbackUserProviderSetup } : {}),
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

  // ---------------------------------------------------------------------------
  // Typed action helpers
  // ---------------------------------------------------------------------------

  async placeOrder(params: PlaceOrderParams): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.PLACE_ORDER, params })
  }

  async placeTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.PLACE_TRIGGER_ORDER,
      params,
    })
  }

  async cancelOrders(
    params: CancelOrdersParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.CANCEL_ORDER, params })
  }

  async modifyOrders(
    params: ModifyOrdersParams
  ): Promise<ExecuteActionResponse> {
    return this.execute({ ...params, action: ActionType.MODIFY_ORDER, params })
  }

  async updatePositionMargin(params: {
    provider: string
    address: Address
    asset: AssetIdentity
    action: 'add' | 'remove'
    amount: string
  }): Promise<ExecuteActionResponse> {
    return this.execute({
      ...params,
      action: ActionType.UPDATE_POSITION_MARGIN,
      params,
    })
  }

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
   */
  async execute<T extends ActionType>(params: {
    provider: string
    address: Address
    signerAddress?: Address
    action: T
    params: ActionParamsMap[T]
  }): Promise<ExecuteActionResponse> {
    await this.loadSigningMode(params.address, params.provider)
    const metadata = await this.getProviderMetadata(params.provider)
    const descriptor = findActionDescriptor(metadata, params.action)

    let lastError: unknown
    for (let attempt = 0; attempt < MAX_NONCE_RETRIES; attempt++) {
      const { actions } = await this.buildAction(params.action, {
        provider: params.provider,
        address: params.address,
        params: params.params,
      })
      try {
        return await this.autoSignAndExecute(
          params.provider,
          params.address,
          params.action,
          actions,
          descriptor
        )
      } catch (err) {
        if (
          err instanceof PerpsError &&
          err.code === PerpsErrorCode.InvalidNonce
        ) {
          lastError = err
          continue
        }
        throw err
      }
    }
    throw lastError
  }
}
