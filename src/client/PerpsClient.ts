import type {
  ActionDescriptor,
  ActionParamsMap,
  ActionStep,
  Address,
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
  DEFAULT_API_KEY_INDEX,
  type LighterApiKey,
  LighterKeyStore,
  LighterSigner,
  type LighterSignerConfig,
} from '../signers/lighter/index.js'
import {
  signTypedData,
  signTypedDataWithSigner,
} from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import {
  type BuildWithdrawalParams,
  type CancelOrdersParams,
  type CheckPrerequisitesParams,
  type ExecutePrerequisitesParams,
  type ExecutePrerequisitesResult,
  type GetPrerequisitesParams,
  type ModifyOrdersParams,
  type PerpsClientOptions,
  type PlaceOrderParams,
  type PlaceTriggerOrderParams,
  type PrerequisitesResult,
  SigningMode,
} from './types.js'

/**
 * Look up an action's descriptor in the provider's metadata. Throws if the
 * action isn't declared — defensive: better to fail loudly than to mis-sign.
 */
function findActionDescriptor(
  metadata: Provider,
  action: ActionType
): ActionDescriptor {
  const descriptor = [
    ...metadata.prepareAccountActions,
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
  private _lighterSigner: LighterSigner | undefined
  private _lighterKeyStore: LighterKeyStore | undefined

  constructor(options: PerpsClientOptions) {
    this.storage = options.storage ?? localStorageAdapter
    this.lighterConfig = options.lighter
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

  /**
   * Set or update the wallet signer for USER-mode signing.
   * Call this when the user connects their wallet (e.g. from wagmi's useWalletClient).
   * Pass undefined to clear the signer when the wallet disconnects.
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

  private buildPrerequisiteInputs(
    prerequisites: ActionDescriptor[],
    mode: SigningMode,
    agentAddress?: Address
  ): Array<{ key: string; params?: Record<string, unknown> }> {
    return prerequisites
      .filter((p) => {
        if (mode === SigningMode.USER) {
          if (!p.signers.includes(PerpsSigner.USER)) {
            return false
          }
          if (p.type === ActionType.APPROVE_AGENT) {
            return false
          }
          return true
        }
        if (
          p.signers.includes(PerpsSigner.USER) &&
          !p.signers.includes(PerpsSigner.AGENT) &&
          p.type === ActionType.USER_SET_ABSTRACTION
        ) {
          return false
        }
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

    // Check if this action supports agent signing
    const metadata = await this.getProviderMetadata(provider)
    const allActions = [...metadata.prepareAccountActions, ...metadata.actions]
    const descriptor = allActions.find((d) => d.type === action)
    if (!descriptor?.signers.includes(PerpsSigner.AGENT)) {
      return undefined
    }

    const agent = await this.sdkClient.agentManager.getAgent(address, provider)
    return agent.address
  }

  private async autoSignAndExecute(
    provider: string,
    address: Address,
    action: ActionType,
    actions: ActionStep[],
    signingMethod: SigningMethod
  ): Promise<ExecuteActionResponse> {
    const mode = this.getSigningMode(address, provider)

    switch (signingMethod) {
      case SigningMethod.EIP712: {
        const eip712Actions = actions as Eip712ActionStep[]

        if (mode === SigningMode.USER_AGENT) {
          // USER_AGENT: sign with the stored agent private key
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

        // USER: sign with the externally-provided signer (wagmi WalletClient,
        // privateKeyToAccount, mnemonicToAccount — any viem-compatible signer).
        // We use signer.account.signTypedData which accepts primaryType: string,
        // matching PerpsTypedData without requiring strict generic inference.
        if (!this.sdkClient.signer) {
          throw new Error(
            'USER signing mode requires a signer. Pass a WalletClient to createPerpsClient({ signer }).'
          )
        }
        const { signer } = this.sdkClient
        const signedUserActions: SignedActionStep[] = await Promise.all(
          eip712Actions.map(
            async (a): Promise<Eip712SignedActionStep> => ({
              action: a.action,
              typedData: a.typedData,
              signature: await signTypedDataWithSigner(signer, a.typedData),
            })
          )
        )
        return executeAction(this.sdkClient, {
          provider,
          address,
          signerAddress: address,
          action,
          actions: signedUserActions,
        })
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
        throw new Error(`Unknown signingMethod: ${signingMethod}`)
    }
  }

  /**
   * Sign a single prerequisite step using whichever signing path matches the
   * step's shape — EIP-712 typed data, WASM blob (with the hybrid EIP-191 +
   * WASM flow for REGISTER_API_KEY), or EVM transaction. Lets consumers
   * (e.g. the widget's PrerequisitesContext) collect signed prereqs without
   * embedding per-method signing logic.
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
   * client. Used today for Lighter DEPOSIT (approve + deposit on Ethereum
   * mainnet) — submitted serially so the deposit can rely on the approve
   * having mined. Each step's `txParams` carries chainId, target, function
   * name, args, and a human-readable abi from the backend.
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
    const accountIndex = (account.config as { accountIndex?: number })
      .accountIndex
    if (typeof accountIndex !== 'number') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Lighter getAccount response is missing config.accountIndex for ${address}.`
      )
    }

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

  async submitSignedAction(
    action: ActionType,
    params: {
      provider: string
      address: Address
      actions: SignedActionStep[]
    }
  ): Promise<ExecuteActionResponse> {
    return executeAction(this.sdkClient, { ...params, action })
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
    if (mode === SigningMode.USER_AGENT) {
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
  // Prerequisites (was: authorizations)
  // ---------------------------------------------------------------------------

  async checkPrerequisites(
    params: GetPrerequisitesParams
  ): Promise<PrerequisitesResult> {
    const { provider, address } = params
    const mode = await this.loadSigningMode(address, provider)

    let agentAddress: Address | undefined
    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getOrCreateAgent(
        address,
        provider
      )
      agentAddress = agent.address
    }

    const metadata = await this.getProviderMetadata(provider)
    const allInputs = this.buildPrerequisiteInputs(
      metadata.prepareAccountActions,
      mode,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userPrerequisites: [], agentPrerequisites: [], isReady: true }
    }

    // Build a signer lookup from action descriptors
    const signersByAction = new Map<string, PerpsSigner[]>()
    for (const desc of metadata.prepareAccountActions) {
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
      metadata.prepareAccountActions,
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

  async executePrerequisites(
    params: ExecutePrerequisitesParams
  ): Promise<ExecutePrerequisitesResult> {
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

    // 2. Auto-sign and submit agent prerequisites
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
      const agentResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: (firstAction ?? ActionType.AGENT_SET_ABSTRACTION) as ActionType,
        actions: signedAgentActions,
      })

      // If AGENT_SET_ABSTRACTION failed (e.g. dexAbstraction → unified upgrade),
      // fall back to USER_SET_ABSTRACTION so the user can sign it manually.
      const abstractionFailed = agentResults.results.some(
        (r) => !r.success && r.action === ActionType.AGENT_SET_ABSTRACTION
      )

      if (abstractionFailed) {
        const { actions: fallbackActions } = await createAction(
          this.sdkClient,
          {
            provider,
            address,
            action: ActionType.USER_SET_ABSTRACTION,
            params: {} as ActionParamsMap[ActionType.USER_SET_ABSTRACTION],
          }
        )

        if (fallbackActions.length > 0) {
          return {
            userResults,
            agentResults,
            fallbackUserPrerequisites: fallbackActions,
          }
        }
      }

      return { userResults, agentResults }
    }

    return { userResults }
  }

  // ---------------------------------------------------------------------------
  // Trading — build (USER mode) methods
  // ---------------------------------------------------------------------------

  async buildOrder(params: PlaceOrderParams): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.PLACE_ORDER, {
      provider: params.provider,
      address: params.address,
      params: {
        asset: params.asset,
        side: params.side,
        type: params.type,
        size: params.size,
        price: params.price,
        leverage: params.leverage,
        reduceOnly: params.reduceOnly,
        timeInForce: params.timeInForce,
        expiresAt: params.expiresAt,
        takeProfit: params.takeProfit,
        stopLoss: params.stopLoss,
      },
    })
  }

  async buildTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.PLACE_TRIGGER_ORDER, {
      provider: params.provider,
      address: params.address,
      params: {
        asset: params.asset,
        side: params.side,
        takeProfit: params.takeProfit,
        stopLoss: params.stopLoss,
      },
    })
  }

  async buildCancelOrder(
    params: CancelOrdersParams
  ): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.CANCEL_ORDER, {
      provider: params.provider,
      address: params.address,
      params: { ids: params.ids },
    })
  }

  async buildModifyOrder(
    params: ModifyOrdersParams
  ): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.MODIFY_ORDER, {
      provider: params.provider,
      address: params.address,
      params: {
        modifications: params.modifications,
      },
    })
  }

  async buildPositionMargin(params: {
    provider: string
    address: Address
    asset: AssetIdentity
    action: 'add' | 'remove'
    amount: string
  }): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.UPDATE_POSITION_MARGIN, {
      provider: params.provider,
      address: params.address,
      params: {
        asset: params.asset,
        action: params.action,
        amount: params.amount,
      },
    })
  }

  async buildWithdrawal(
    params: BuildWithdrawalParams
  ): Promise<CreateActionResponse> {
    return this.buildAction(ActionType.WITHDRAWAL, {
      provider: params.provider,
      address: params.address,
      params: params.withdrawal,
    })
  }

  // ---------------------------------------------------------------------------
  // Trading — submit signed actions (USER mode)
  // ---------------------------------------------------------------------------

  async submitSignedOrder(params: {
    provider: string
    address: Address
    actions: SignedActionStep[]
  }): Promise<ExecuteActionResponse> {
    return this.submitSignedAction(ActionType.PLACE_ORDER, params)
  }

  async submitSignedPosition(params: {
    provider: string
    address: Address
    actions: SignedActionStep[]
  }): Promise<ExecuteActionResponse> {
    return this.submitSignedAction(ActionType.UPDATE_POSITION_MARGIN, params)
  }

  async submitWithdrawal(params: {
    provider: string
    address: Address
    action: SignedActionStep
  }): Promise<ExecuteActionResponse> {
    return this.submitSignedAction(ActionType.WITHDRAWAL, {
      provider: params.provider,
      address: params.address,
      actions: [params.action],
    })
  }

  // ---------------------------------------------------------------------------
  // Trading — auto-sign (USER_AGENT mode)
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

  /**
   * Execute any action type through the SDK's signing pipeline.
   * Handles both USER and USER_AGENT signing modes automatically.
   * Use this for action types without dedicated high-level methods.
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
    const { actions } = await this.buildAction(params.action, {
      provider: params.provider,
      address: params.address,
      params: params.params,
    })
    return this.autoSignAndExecute(
      params.provider,
      params.address,
      params.action,
      actions,
      descriptor.signingMethod
    )
  }
}
