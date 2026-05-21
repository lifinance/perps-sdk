import type {
  ActionDescriptor,
  ActionParamsMap,
  ActionStep,
  Address,
  ApproveReadOnlyTokenParams,
  AssetIdentity,
  CreateActionResponse,
  Eip712ActionStep,
  Eip712SignedActionStep,
  EvmTxActionStep,
  EvmTxSignedActionStep,
  ExecuteActionResponse,
  Provider,
  SignedActionStep,
  WasmBlobActionStep,
  WasmBlobSignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { parseAbi } from 'viem'
import { localStorageAdapter } from '../agent/storage.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getAccount } from '../services/getAccount.js'
import { getProviders } from '../services/getProviders.js'
import {
  type ApproveReadOnlyTokenResult,
  DEFAULT_API_KEY_INDEX,
  type LighterApiKey,
  LighterKeyStore,
  LighterReadOnlyTokenManager,
  type LighterReadOnlyTokenManagerOptions,
  LighterSigner,
  type LighterSignerConfig,
  walletClientSigner,
} from '../signers/lighter/index.js'
import {
  signTypedData,
  signTypedDataWithSigner,
} from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import { projectAccountConfigSettings } from './projectAccountConfigSettings.js'
import {
  type CancelOrdersParams,
  type CheckPrerequisitesParams,
  type GetAccountResult,
  type GetSetupParams,
  type ModifyOrdersParams,
  type PerpsClientOptions,
  type PlaceOrderParams,
  type PlaceTriggerOrderParams,
  type SatisfySetupParams,
  type SatisfySetupResult,
  type SetupResult,
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
): ActionDescriptor {
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
  private readonly lighterConfig: LighterSignerConfig | undefined
  private readonly lighterReadOnlyTokenOptions:
    | LighterReadOnlyTokenManagerOptions
    | undefined
  private _lighterSigner: LighterSigner | undefined
  private _lighterKeyStore: LighterKeyStore | undefined
  private _lighterReadOnlyTokenManager: LighterReadOnlyTokenManager | undefined

  constructor(options: PerpsClientOptions) {
    this.storage = options.storage ?? localStorageAdapter
    this.lighterConfig = options.lighter
    this.lighterReadOnlyTokenOptions = options.lighterReadOnlyToken
    this.sdkClient = createPerpsClient({
      integrator: options.integrator,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      storage: this.storage,
      providers: options.providers,
    })
  }

  private getLighterSigner(): LighterSigner {
    if (!this._lighterSigner) {
      this._lighterSigner = new LighterSigner(this.lighterConfig)
    }
    return this._lighterSigner
  }

  private getLighterKeyStore(): LighterKeyStore {
    if (!this._lighterKeyStore) {
      this._lighterKeyStore = new LighterKeyStore(this.storage)
    }
    return this._lighterKeyStore
  }

  private getLighterReadOnlyTokenManager(): LighterReadOnlyTokenManager {
    if (!this._lighterReadOnlyTokenManager) {
      this._lighterReadOnlyTokenManager = new LighterReadOnlyTokenManager({
        storage: this.storage,
        ...this.lighterReadOnlyTokenOptions,
      })
    }
    return this._lighterReadOnlyTokenManager
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
   * and therefore cannot be bulk-staged through `buildPrerequisites` with
   * empty params. Callers must dispatch these via `execute(...)` once a
   * value is picked. The post-`APPROVE_AGENT` auto-upgrade path also
   * dispatches `ACCOUNT_MODE` directly with `mode: 'unifiedAccount'`.
   */
  private static readonly EXPLICIT_INPUT_PREREQUISITES: ReadonlySet<ActionType> =
    new Set([ActionType.ACCOUNT_MODE, ActionType.ACCOUNT_TYPE])

  private buildPrerequisiteInputs(
    prerequisites: ActionDescriptor[],
    mode: SigningMode,
    agentAddress?: Address
  ): Array<{ key: string; params?: Record<string, unknown> }> {
    return prerequisites
      .filter((p) => {
        // ACCOUNT_MODE / ACCOUNT_TYPE require explicit params; they're
        // dispatched separately via `execute(...)` (or the post-APPROVE_AGENT
        // auto-upgrade chain) rather than bulk-staged.
        if (PerpsClient.EXPLICIT_INPUT_PREREQUISITES.has(p.type)) {
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
        // USER_AGENT mode: include every remaining declared prerequisite.
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

  private async autoSignAndExecute(
    provider: string,
    address: Address,
    action: ActionType,
    actions: ActionStep[],
    descriptor: ActionDescriptor
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

      case SigningMethod.WASM_BLOB: {
        const wasmActions = actions as WasmBlobActionStep[]
        const signedActions = await this.signWasmBlobActions(
          provider,
          address,
          wasmActions
        )
        return executeAction(this.sdkClient, {
          provider,
          address,
          signerAddress: address,
          action,
          actions: signedActions,
        })
      }

      case SigningMethod.EVM_TX: {
        const evmActions = actions as EvmTxActionStep[]
        const signedActions = await this.signEvmTxActions(evmActions)
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
   * Sign a single prerequisite step using whichever signing path matches the
   * step's shape — EIP-712 typed data, WASM blob (with the hybrid EIP-191 +
   * WASM flow for REGISTER_API_KEY), or EVM transaction. Lets consumers
   * collect signed prereqs without embedding per-method signing logic.
   */
  async signPrerequisite(
    provider: string,
    address: Address,
    step: ActionStep
  ): Promise<SignedActionStep> {
    if ('typedData' in step) {
      if (!this.sdkClient.signer) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'EIP-712 prerequisite signing requires a wallet signer. Pass ' +
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
    if ('wasmSignParams' in step) {
      const [signed] = await this.signWasmBlobActions(provider, address, [step])
      return signed
    }
    if ('txParams' in step) {
      const [signed] = await this.signEvmTxActions([step])
      return signed
    }
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Unknown ActionStep shape — expected typedData, wasmSignParams, or txParams.'
    )
  }

  /**
   * Sign and broadcast a sequence of EVM transactions via the user's wallet
   * client. Steps are submitted serially so a later step (e.g. deposit) can
   * rely on an earlier step (e.g. approve) having mined. Each step's
   * `txParams` carries chainId, target, function name, args, and a
   * human-readable abi from the backend.
   */
  private async signEvmTxActions(
    actions: EvmTxActionStep[]
  ): Promise<EvmTxSignedActionStep[]> {
    if (!this.sdkClient.signer) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'EVM_TX signing requires a wallet signer. Pass `signer` to ' +
          'createPerpsClient or call setSigner(walletClient).'
      )
    }
    const { signer } = this.sdkClient
    const signed: EvmTxSignedActionStep[] = []

    for (const step of actions) {
      const params = step.txParams as {
        chainId: number
        to: Address
        functionName: string
        args: readonly unknown[]
        abi: readonly string[]
      }

      const txHash = await signer.writeContract({
        address: params.to,
        abi: parseAbi(params.abi),
        functionName: params.functionName,
        args: params.args,
        chain: signer.chain,
        account: signer.account,
      })

      signed.push({
        action: step.action,
        txParams: step.txParams,
        txHash,
      })
    }

    return signed
  }

  /**
   * Sign a batch of WASM_BLOB action steps (Lighter). Ensures the user's
   * Lighter API keypair is registered first — generating one and running the
   * REGISTER_API_KEY hybrid flow via the L1 signer if not — then feeds each
   * subsequent step through the WASM signer and returns signed blobs.
   *
   * `ACCOUNT_TYPE` (Lighter `/api/v1/changeAccountTier`) is dispatched as a
   * WASM_BLOB envelope by the backend but is NOT a wasm-signed transaction —
   * Lighter authenticates the endpoint with an auth token and enforces
   * anti-replay server-side (24h cooldown, no open positions). The signer
   * mints a Lighter auth token via the same WASM `CreateAuthToken` the read
   * endpoints use and parks it in `signedTx.txInfo`; the backend's
   * `executeChangeAccountTier` consumes that field as the `auth` form
   * parameter. `txType`/`txHash` are unused for this action — they carry
   * placeholder values to satisfy the `WasmBlobSignedActionStep` shape.
   */
  private async signWasmBlobActions(
    provider: string,
    address: Address,
    actions: WasmBlobActionStep[]
  ): Promise<WasmBlobSignedActionStep[]> {
    const signed: WasmBlobSignedActionStep[] = []
    for (const step of actions) {
      if (step.action === ActionType.REGISTER_API_KEY) {
        signed.push(await this.signRegisterApiKey(provider, address, step))
      } else if (step.action === ActionType.ACCOUNT_TYPE) {
        signed.push(await this.signAccountTierChange(address, step))
      } else {
        signed.push(await this.signStandardWasmAction(provider, address, step))
      }
    }
    return signed
  }

  private async signStandardWasmAction(
    provider: string,
    address: Address,
    step: WasmBlobActionStep
  ): Promise<WasmBlobSignedActionStep> {
    const apiKey = await this.getLighterKeyStore().get(address)
    if (!apiKey) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `No Lighter API key registered for ${address}. ` +
          'Run prepareAccount / REGISTER_API_KEY first.'
      )
    }
    const signer = this.getLighterSigner()
    const signedTx = await signer.sign(step.action, step.wasmSignParams, {
      apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
      apiKeyIndex: apiKey.apiKeyIndex,
      accountIndex: apiKey.accountIndex,
    })
    void provider
    return {
      action: step.action,
      wasmSignParams: step.wasmSignParams,
      signedTx,
    }
  }

  /**
   * REGISTER_API_KEY flow:
   *   1. Look up the user's Lighter accountIndex from getAccount()
   *   2. Generate a fresh Lighter API keypair via the WASM signer
   *   3. Call SignChangePubKey to produce the WASM blob + EIP-191 message
   *   4. Have the user's L1 Ethereum wallet sign the message
   *   5. Inject the L1 signature into the ChangePubKey txInfo JSON
   *   6. Persist the keypair and return the signed blob
   *
   * Requires a USER wallet signer to be set via `setSigner` or passed at
   * construction — the L1 signature is the user's consent to rotate keys.
   */
  private async signRegisterApiKey(
    provider: string,
    address: Address,
    step: WasmBlobActionStep
  ): Promise<WasmBlobSignedActionStep> {
    if (!this.sdkClient.signer) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'REGISTER_API_KEY requires a wallet signer — pass `signer` to ' +
          'createPerpsClient or call setSigner(walletClient).'
      )
    }

    const params = step.wasmSignParams as {
      api_key_index?: number
      nonce?: number
    }
    const apiKeyIndex = params.api_key_index ?? DEFAULT_API_KEY_INDEX
    const nonce = params.nonce
    if (typeof nonce !== 'number') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'REGISTER_API_KEY wasmSignParams is missing `nonce`.'
      )
    }

    const account = await getAccount(this.sdkClient, { provider, address })
    if (account.config.provider !== 'lighter') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `REGISTER_API_KEY requires a Lighter account, but getAccount ` +
          `returned config for provider '${account.config.provider}'.`
      )
    }
    const accountIndex = account.config.accountIndex

    const signer = this.getLighterSigner()
    const keypair = await signer.generateAPIKey()
    const changePubKey = await signer.signChangePubKey(
      keypair.publicKey,
      keypair.privateKey,
      nonce,
      apiKeyIndex,
      accountIndex
    )

    const l1Signature = await this.sdkClient.signer.signMessage({
      account: this.sdkClient.signer.account,
      message: changePubKey.messageToSign,
    })

    const txInfoWithL1Sig = signer.embedL1Signature(
      changePubKey.txInfo,
      l1Signature
    )

    const apiKey: LighterApiKey = {
      accountIndex,
      apiKeyIndex,
      apiKeyPrivateKey: keypair.privateKey,
      apiKeyPublicKey: keypair.publicKey,
    }
    await this.getLighterKeyStore().set(address, apiKey)

    return {
      action: step.action,
      wasmSignParams: {
        ...step.wasmSignParams,
        new_public_key: keypair.publicKey,
      },
      signedTx: {
        txType: changePubKey.txType,
        txInfo: txInfoWithL1Sig,
        txHash: changePubKey.txHash,
      },
    }
  }

  /**
   * Sign an `ACCOUNT_TYPE` step (Lighter `changeAccountTier`).
   *
   * Lighter's `/api/v1/changeAccountTier` is an HTTP-only mutation —
   * Lighter does NOT consume a wasm-signed transaction here; it
   * authenticates the request with the same auth token its read endpoints
   * use, and enforces anti-replay business rules server-side. The backend
   * therefore declares the step as a `WasmBlobActionStep` with
   * `wasmSignParams.kind = 'changeAccountTier'` and expects the SDK to
   * mint an auth token in lieu of a transaction signature. That contract
   * is documented in `lifi-perps-backend/src/providers/lighter/actions/
   * lighter.actions.accountType.ts` and consumed by `executeChangeAccountTier`.
   *
   * The auth-token deadline mirrors {@link createLighterAuthToken}'s 1h
   * default — Lighter caps tokens at 8h hard, and the backend's executor
   * runs `verifyPendingAction` then a single `/changeAccountTier` POST,
   * which completes well inside an hour.
   */
  private async signAccountTierChange(
    address: Address,
    step: WasmBlobActionStep
  ): Promise<WasmBlobSignedActionStep> {
    const apiKey = await this.getLighterKeyStore().get(address)
    if (!apiKey) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `No Lighter API key registered for ${address}. ` +
          'Run prepareAccount / REGISTER_API_KEY first.'
      )
    }
    const signer = this.getLighterSigner()
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60
    const authToken = await signer.createAuthToken(deadline, {
      apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
      apiKeyIndex: apiKey.apiKeyIndex,
      accountIndex: apiKey.accountIndex,
    })
    return {
      action: step.action,
      wasmSignParams: step.wasmSignParams,
      signedTx: {
        // `/changeAccountTier` reads only `txInfo` (the auth token); `txType`
        // and `txHash` are placeholders to satisfy the envelope shape.
        txType: 0,
        txInfo: authToken,
        txHash: '',
      },
    }
  }

  /**
   * Return a bearer token that authenticates Lighter's read endpoints
   * (getOrders, getOrder, getActivity, getFills).
   *
   * Resolution order:
   *   1. The long-lived read-only token persisted by `approveReadOnlyToken`,
   *      when one is stored for this `(address, accountIndex)` AND has not
   *      passed its recorded `expiry`. The SDK never returns an expired
   *      stored token.
   *   2. A freshly minted 8h Lighter auth token, signed off the user's
   *      Lighter API key. Requires `REGISTER_API_KEY` to have completed.
   *   3. `undefined` — caller falls back to public reads.
   *
   * `accountIndex` lets callers in pure read-only mode (no API key
   * registered) target the RO token. When omitted, the SDK derives it from
   * the user's registered API key.
   *
   * `deadlineSeconds` only affects the standard-token fallback (Lighter caps
   * those tokens at 8h). Read-only tokens carry their own mint-time expiry
   * recorded by {@link approveReadOnlyToken}.
   */
  async createLighterAuthToken(
    address: Address,
    deadlineSeconds?: number,
    accountIndex?: number
  ): Promise<string | undefined> {
    const apiKey = await this.getLighterKeyStore().get(address)
    const resolvedAccountIndex = accountIndex ?? apiKey?.accountIndex
    if (resolvedAccountIndex !== undefined) {
      const stored = await this.getLighterReadOnlyTokenManager().get(
        address,
        resolvedAccountIndex
      )
      if (stored) {
        return stored.token
      }
    }
    if (!apiKey) {
      return undefined
    }
    const deadline = deadlineSeconds ?? Math.floor(Date.now() / 1000) + 60 * 60
    const signer = this.getLighterSigner()
    return signer.createAuthToken(deadline, {
      apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
      apiKeyIndex: apiKey.apiKeyIndex,
      accountIndex: apiKey.accountIndex,
    })
  }

  /**
   * Mint a long-lived Lighter read-only token via Lighter's
   * `tokens/create` endpoint and persist it through the configured
   * `StorageAdapter`, keyed by `(L1 address, accountIndex)`.
   *
   * The user's connected wallet signs an EIP-191 message describing the
   * mint request; the resulting `Authorization` header authenticates the
   * Lighter HTTP call. The bearer string Lighter returns is persisted
   * alongside its `expiry` and `scope`; subsequent calls to
   * {@link createLighterAuthToken} prefer it over the 8h standard token.
   *
   * `expirySeconds` is the absolute unix-seconds expiry recorded on
   * Lighter's row. Lighter enforces 1 day ≤ lifetime ≤ 10 years
   * server-side; the SDK does NOT pre-validate and surfaces Lighter's 400
   * verbatim. `scope` defaults to `'all'`; the `'single'` variant is wired
   * through but only useful when the caller has a specific reason to scope
   * the token to one account.
   *
   * Requires a USER wallet signer to be set via {@link setSigner} or
   * passed at construction — the L1 signature is the user's consent.
   */
  async approveReadOnlyToken(
    address: Address,
    params: ApproveReadOnlyTokenParams
  ): Promise<ApproveReadOnlyTokenResult> {
    if (!this.sdkClient.signer) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'approveReadOnlyToken requires a wallet signer — pass `signer` to ' +
          'createPerpsClient or call setSigner(walletClient).'
      )
    }
    const signer = walletClientSigner(this.sdkClient.signer)
    return this.getLighterReadOnlyTokenManager().approve(signer, {
      address,
      ...params,
    })
  }

  /**
   * Whether the stored Lighter read-only token for `(address, accountIndex)`
   * falls within `thresholdDays` of its `expiry`. Returns `false` when no
   * token is stored, when the stored token has already expired, or when
   * more than `thresholdDays` of life remain. Intended for widget renewal
   * banners (default threshold: 30 days).
   */
  async isLighterReadOnlyTokenExpiringSoon(
    address: Address,
    accountIndex: number,
    thresholdDays?: number
  ): Promise<boolean> {
    return this.getLighterReadOnlyTokenManager().isReadOnlyTokenExpiringSoon(
      address,
      accountIndex,
      thresholdDays
    )
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
    const [response, metadata] = await Promise.all([
      getAccount(this.sdkClient, params),
      this.getProviderMetadata(params.provider),
    ])
    const settings = projectAccountConfigSettings(
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
      await getAccount(this.sdkClient, { provider, address })
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
  async checkSetup(params: GetSetupParams): Promise<SetupResult> {
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

    const allInputs = this.buildPrerequisiteInputs(
      metadata.setup,
      mode,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userPrerequisites: [], agentPrerequisites: [], isReady: true }
    }

    // Build a signer lookup from setup descriptors.
    const signersByAction = new Map<string, PerpsSigner[]>()
    for (const desc of metadata.setup) {
      signersByAction.set(desc.type, desc.signers)
    }

    // Send all to backend via createAction for the first prerequisite type
    // The backend filters already-satisfied ones and returns typed data
    const { actions } = await this.buildPrerequisites({
      provider,
      address,
      signerAddress: agentAddress,
    })

    if (actions.length === 0) {
      return { userPrerequisites: [], agentPrerequisites: [], isReady: true }
    }

    const userPrerequisites = actions.filter((a) => {
      const signers = signersByAction.get(a.action) ?? []
      return signers.includes(PerpsSigner.USER)
    })
    const agentPrerequisites = actions.filter((a) => {
      const signers = signersByAction.get(a.action) ?? []
      return signers.includes(PerpsSigner.AGENT)
    })

    return {
      userPrerequisites,
      agentPrerequisites,
      isReady: false,
    }
  }

  async buildPrerequisites(
    params: CheckPrerequisitesParams
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
    const allInputs = this.buildPrerequisiteInputs(
      metadata.setup,
      mode,
      signerAddress
    )

    // Use the first prerequisite type as the action type for the batch
    // The backend handles all prerequisites in a single createPrerequisite call
    const allActions: ActionStep[] = []
    for (const input of allInputs) {
      const { actions } = await createAction(this.sdkClient, {
        provider: params.provider,
        address: params.address,
        signerAddress,
        action: input.key as ActionType,
        params: (input.params ?? {}) as Record<string, never>,
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
   *   surface a wallet prompt via `fallbackUserPrerequisites`.
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
    const account = await getAccount(this.sdkClient, { provider, address })
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
    const modeParam = item.params.find((p) => p.name === 'mode')
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
   *      `fallbackUserPrerequisites`.
   *   3. Sign and submit any pre-staged agent-side setup actions the
   *      backend returned alongside the user-signed ones.
   */
  async satisfySetup(params: SatisfySetupParams): Promise<SatisfySetupResult> {
    const { provider, address, required, userSignedActions } = params
    const mode = await this.loadSigningMode(address, provider)

    // 1. Submit user-signed prerequisites
    let userResults: ExecuteActionResponse = { results: [] }
    if (userSignedActions.length > 0) {
      const signerAddress =
        mode === SigningMode.USER_AGENT
          ? (await this.sdkClient.agentManager.getAgent(address, provider))
              .address
          : address

      // Submit all user-signed actions — use first action's type for routing
      const firstAction = required.userPrerequisites[0]?.action as string
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
    let fallbackUserPrerequisites: ActionStep[] | undefined
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
          fallbackUserPrerequisites = upgrade.fallback
        }
      }
    }

    // 3. Sign and submit any pre-staged agent prerequisites returned by the
    //    backend's `buildPrerequisites` call. ACCOUNT_MODE is filtered out of
    //    bulk staging (it requires explicit `mode` params), so this block
    //    today only runs for future agent-signed steps the backend chooses
    //    to stage.
    if (
      required.agentPrerequisites.length > 0 &&
      mode === SigningMode.USER_AGENT
    ) {
      const agent = await this.sdkClient.agentManager.getAgent(
        address,
        provider
      )

      const signedAgentActions: SignedActionStep[] = await Promise.all(
        (required.agentPrerequisites as Eip712ActionStep[]).map(
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

      const firstAction = required.agentPrerequisites[0]?.action as string
      const stagedResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: (firstAction ?? ActionType.ACCOUNT_MODE) as ActionType,
        actions: signedAgentActions,
      })

      // Merge staged-prereq results with any auto-upgrade results from step 2.
      agentResults = {
        results: [...(agentResults?.results ?? []), ...stagedResults.results],
      }
    }

    return {
      userResults,
      ...(agentResults ? { agentResults } : {}),
      ...(fallbackUserPrerequisites ? { fallbackUserPrerequisites } : {}),
    }
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
   * Execute any action through the SDK's signing pipeline. Signing is routed
   * by the action's descriptor in provider metadata — the agent keypair, the
   * configured WalletClient signer, the Lighter API key, or an EVM tx — as
   * the descriptor's `signers` and `signingMethod` dictate.
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
