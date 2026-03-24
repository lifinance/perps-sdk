import type {
  ActionDescriptor,
  ActionStep,
  Address,
  CreateActionResponse,
  ExecuteActionResponse,
  Provider,
  SignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  OrderType,
  PerpsErrorCode,
  PerpsSigner,
} from '@lifi/perps-types'
import { localStorageAdapter } from '../agent/storage.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsErrorMessage } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import { createAction } from '../services/createAction.js'
import { executeAction } from '../services/executeAction.js'
import { getProviders } from '../services/getProviders.js'
import { signTypedData } from '../utils/signTypedData.js'
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

export class PerpsClient {
  private sdkClient: PerpsSDKClient
  private storage: StorageAdapter
  private signingModes: Map<string, SigningMode> = new Map()
  private providerMetadataCache: Map<string, Provider> = new Map()

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
        if (p.usage === 'user') {
          return false
        }
        if (mode === SigningMode.USER) {
          if (p.signer !== PerpsSigner.USER) {
            return false
          }
          if (p.type === ActionType.APPROVE_AGENT) {
            return false
          }
          return true
        }
        if (
          p.signer === PerpsSigner.USER &&
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

  private async resolveSignerAddress(
    address: Address,
    provider: string
  ): Promise<Address | undefined> {
    const mode = await this.loadSigningMode(address, provider)
    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getAgent(
        address,
        provider
      )
      return agent.address
    }
    return undefined
  }

  private requireAgentMode(address: Address, provider: string, method: string) {
    const mode = this.getSigningMode(address, provider)
    if (mode !== SigningMode.USER_AGENT) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `${PerpsErrorMessage.InvalidSigningMode} ${method} requires USER_AGENT mode.`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }
  }

  private async autoSignAndExecute(
    provider: string,
    address: Address,
    action: ActionType,
    actions: ActionStep[]
  ): Promise<ExecuteActionResponse> {
    const agent = await this.sdkClient.agentManager.getAgent(address, provider)

    const signedActions: SignedActionStep[] = await Promise.all(
      actions.map(async (a) => ({
        action: a.action,
        typedData: a.typedData,
        signature: await signTypedData(agent.privateKey, a.typedData),
      }))
    )

    return executeAction(this.sdkClient, {
      provider,
      address,
      signerAddress: agent.address,
      action,
      actions: signedActions,
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
      metadata.prerequisites,
      mode,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userPrerequisites: [], agentPrerequisites: [], isReady: true }
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

    const userPrerequisites = actions.filter(
      (a) => a.signer === PerpsSigner.USER
    )
    const agentPrerequisites = actions.filter(
      (a) => a.signer === PerpsSigner.AGENT
    )

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
      metadata.prerequisites,
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

      const optionalActions = new Set(
        required.userPrerequisites
          .filter((a) => a.optional)
          .map((a) => a.action)
      )
      const mandatoryFailure = userResults.results.find(
        (r) => !r.success && !optionalActions.has(r.action)
      )
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
        required.agentPrerequisites.map(async (action) => ({
          action: action.action,
          typedData: action.typedData,
          signature: await signTypedData(agent.privateKey, action.typedData),
        }))
      )

      const firstAction = required.agentPrerequisites[0]?.action as string
      const agentResults = await executeAction(this.sdkClient, {
        provider,
        address,
        signerAddress: agent.address,
        action: (firstAction ?? ActionType.AGENT_SET_ABSTRACTION) as ActionType,
        actions: signedAgentActions,
      })

      return { userResults, agentResults }
    }

    return { userResults }
  }

  // ---------------------------------------------------------------------------
  // Trading — build (USER mode) methods
  // ---------------------------------------------------------------------------

  async buildOrder(params: PlaceOrderParams): Promise<CreateActionResponse> {
    const signerAddress = await this.resolveSignerAddress(
      params.address,
      params.provider
    )

    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action: ActionType.PLACE_ORDER,
      params: {
        symbol: params.symbol,
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
        market: params.market,
      },
    })
  }

  async buildTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<CreateActionResponse> {
    return this.buildOrder({
      ...params,
      type: OrderType.TRIGGER_ONLY,
      price: '0',
    })
  }

  async buildCancelOrder(
    params: CancelOrdersParams
  ): Promise<CreateActionResponse> {
    const signerAddress = await this.resolveSignerAddress(
      params.address,
      params.provider
    )

    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action: ActionType.CANCEL_ORDER,
      params: { ids: params.ids },
    })
  }

  async buildModifyOrder(
    params: ModifyOrdersParams
  ): Promise<CreateActionResponse> {
    const signerAddress = await this.resolveSignerAddress(
      params.address,
      params.provider
    )

    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action: ActionType.MODIFY_ORDER,
      params: {
        symbol: params.symbol,
        side: params.side,
        modifications: params.modifications,
      },
    })
  }

  async buildPositionMargin(params: {
    provider: string
    address: Address
    symbol: string
    action: 'add' | 'remove'
    amount: string
  }): Promise<CreateActionResponse> {
    const signerAddress = await this.resolveSignerAddress(
      params.address,
      params.provider
    )

    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      signerAddress,
      action: ActionType.UPDATE_POSITION_MARGIN,
      params: {
        symbol: params.symbol,
        action: params.action,
        amount: params.amount,
      },
    })
  }

  async buildWithdrawal(
    params: BuildWithdrawalParams
  ): Promise<CreateActionResponse> {
    return createAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      action: ActionType.WITHDRAWAL,
      params: params.withdrawal,
    })
  }

  // ---------------------------------------------------------------------------
  // Trading — submit signed actions (USER mode)
  // ---------------------------------------------------------------------------

  async submitSignedOrder(params: {
    provider: string
    address: Address
    signerAddress?: Address
    actions: SignedActionStep[]
  }): Promise<ExecuteActionResponse> {
    return executeAction(this.sdkClient, {
      ...params,
      action: ActionType.PLACE_ORDER,
    })
  }

  async submitSignedPosition(params: {
    provider: string
    address: Address
    signerAddress?: Address
    actions: SignedActionStep[]
  }): Promise<ExecuteActionResponse> {
    return executeAction(this.sdkClient, {
      ...params,
      action: ActionType.UPDATE_POSITION_MARGIN,
    })
  }

  async submitWithdrawal(params: {
    provider: string
    address: Address
    action: SignedActionStep
  }): Promise<ExecuteActionResponse> {
    return executeAction(this.sdkClient, {
      provider: params.provider,
      address: params.address,
      action: ActionType.WITHDRAWAL,
      actions: [params.action],
    })
  }

  // ---------------------------------------------------------------------------
  // Trading — auto-sign (USER_AGENT mode)
  // ---------------------------------------------------------------------------

  async placeOrder(params: PlaceOrderParams): Promise<ExecuteActionResponse> {
    await this.loadSigningMode(params.address, params.provider)
    this.requireAgentMode(params.address, params.provider, 'placeOrder()')

    const { actions } = await this.buildOrder(params)
    return this.autoSignAndExecute(
      params.provider,
      params.address,
      ActionType.PLACE_ORDER,
      actions
    )
  }

  async placeTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<ExecuteActionResponse> {
    return this.placeOrder({
      ...params,
      type: OrderType.TRIGGER_ONLY,
      price: '0',
    })
  }

  async cancelOrders(
    params: CancelOrdersParams
  ): Promise<ExecuteActionResponse> {
    await this.loadSigningMode(params.address, params.provider)
    this.requireAgentMode(params.address, params.provider, 'cancelOrders()')

    const { actions } = await this.buildCancelOrder(params)
    return this.autoSignAndExecute(
      params.provider,
      params.address,
      ActionType.CANCEL_ORDER,
      actions
    )
  }

  async modifyOrders(
    params: ModifyOrdersParams
  ): Promise<ExecuteActionResponse> {
    await this.loadSigningMode(params.address, params.provider)
    this.requireAgentMode(params.address, params.provider, 'modifyOrders()')

    const { actions } = await this.buildModifyOrder(params)
    return this.autoSignAndExecute(
      params.provider,
      params.address,
      ActionType.MODIFY_ORDER,
      actions
    )
  }

  async updatePositionMargin(params: {
    provider: string
    address: Address
    symbol: string
    action: 'add' | 'remove'
    amount: string
  }): Promise<ExecuteActionResponse> {
    await this.loadSigningMode(params.address, params.provider)
    this.requireAgentMode(
      params.address,
      params.provider,
      'updatePositionMargin()'
    )

    const { actions } = await this.buildPositionMargin(params)
    return this.autoSignAndExecute(
      params.provider,
      params.address,
      ActionType.UPDATE_POSITION_MARGIN,
      actions
    )
  }
}
