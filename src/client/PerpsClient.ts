import type {
  Address,
  AuthorizationInput,
  AuthorizationsResponse,
  CancelOrderPayloadResponse,
  CreateAuthorizationResponse,
  CreateOrderResponse,
  OrderActionType,
  SignedAuthorization,
  SignedOrderAction,
  SubmitOrderResponse,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsErrorMessage } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import { cancelOrder } from '../services/cancelOrder.js'
import { createAuthorization } from '../services/createAuthorization.js'
import { createOrder } from '../services/createOrder.js'
import { getAccount } from '../services/getAccount.js'
import { getDexes } from '../services/getDexes.js'
import type { SubmitAuthorizationParams } from '../services/submitAuthorization.js'
import { submitAuthorization } from '../services/submitAuthorization.js'
import type { SubmitOrderParams } from '../services/submitOrder.js'
import { submitOrder } from '../services/submitOrder.js'
import { signTypedData } from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import type {
  BuildAuthorizationParams,
  CancelOrdersParams,
  ExecuteAuthorizationsParams,
  ExecuteAuthorizationsResult,
  GetRequiredAuthorizationsParams,
  PerpsClientOptions,
  PlaceOrderParams,
  RequiredAuthorizationsResult,
  SigningMode,
} from './types.js'

/**
 * Stateful client for managing signing modes and trading operations.
 *
 * The PerpsClient provides two signing modes:
 * - `USER`: User wallet signs each action (wallet popup per action)
 * - `USER_AGENT`: SDK-generated agent signs actions (no popups after setup)
 *
 * In `USER_AGENT` mode, the client:
 * - Generates an agent keypair stored in localStorage (or custom storage)
 * - Auto-injects agent address into authorization requests
 * - Auto-signs trading actions with the agent key
 *
 * @example
 * ```ts
 * const perps = new PerpsClient({ integrator: 'my-app' })
 *
 * // Set up agent signing for a user + DEX pair
 * await perps.setSigningMode(userAddress, 'hyperliquid', 'USER_AGENT')
 *
 * // Build authorization (agent address auto-injected)
 * const { actions } = await perps.buildAuthorization({
 *   dex: 'hyperliquid',
 *   address: userAddress,
 *   authorizations: [
 *     { key: 'ApproveAgent' },
 *     { key: 'ApproveBuilderFee' }
 *   ]
 * })
 *
 * // ... sign actions with user wallet ...
 *
 * // Place orders (agent signs automatically)
 * const result = await perps.placeOrder({
 *   address: userAddress,
 *   dex: 'hyperliquid',
 *   symbol: 'BTC',
 *   side: 'BUY',
 *   type: 'MARKET',
 *   size: '0.1',
 *   price: '95000.00'
 * })
 * ```
 */
export class PerpsClient {
  private sdkClient: PerpsSDKClient
  private signingModes: Map<string, SigningMode> = new Map()

  constructor(options: PerpsClientOptions) {
    this.sdkClient = createPerpsClient({
      integrator: options.integrator,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      storage: options.storage,
      healthCheck: options.healthCheck,
    })
  }

  /**
   * Get the underlying SDK client for use with service functions.
   */
  get client(): PerpsSDKClient {
    return this.sdkClient
  }

  /**
   * Promise that resolves when the API health check passes.
   * Await this before making requests if you need to handle readiness explicitly.
   */
  get ready(): Promise<void> {
    return this.sdkClient.ready
  }

  /**
   * Get the storage key for a user + DEX pair.
   */
  private modeKey(address: Address, dex: string): string {
    return `${address.toLowerCase()}:${dex.toLowerCase()}`
  }

  /**
   * Set the signing mode for a user + DEX pair.
   *
   * In `USER_AGENT` mode, generates an agent keypair if one doesn't exist.
   *
   * @param address - User wallet address
   * @param dex - DEX identifier
   * @param mode - Signing mode to set
   */
  async setSigningMode(
    address: Address,
    dex: string,
    mode: SigningMode
  ): Promise<void> {
    const key = this.modeKey(address, dex)
    this.signingModes.set(key, mode)

    if (mode === 'USER_AGENT') {
      // Generate agent keypair if not exists
      await this.sdkClient.agentManager.getOrCreateAgent(address, dex)
    }
  }

  /**
   * Get the current signing mode for a user + DEX pair.
   * Defaults to `USER` if not set.
   */
  getSigningMode(address: Address, dex: string): SigningMode {
    return this.signingModes.get(this.modeKey(address, dex)) ?? 'USER'
  }

  /**
   * Get the agent address for a user + DEX pair.
   *
   * @throws {PerpsError} If in USER mode or agent not found
   */
  async getAgentAddress(address: Address, dex: string): Promise<Address> {
    const agent = await this.sdkClient.agentManager.getAgent(address, dex)
    return agent.address
  }

  /**
   * Check if an agent exists for a user + DEX pair.
   */
  async hasAgent(address: Address, dex: string): Promise<boolean> {
    return this.sdkClient.agentManager.hasAgent(address, dex)
  }

  /**
   * Remove the agent for a user + DEX pair.
   * Also resets signing mode to USER.
   */
  async removeAgent(address: Address, dex: string): Promise<void> {
    await this.sdkClient.agentManager.removeAgent(address, dex)
    this.signingModes.delete(this.modeKey(address, dex))
  }

  /**
   * Build authorization payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`
   * and `agentAddress` param for `ApproveAgent` authorization.
   *
   * @param params - Authorization parameters
   * @returns Authorization actions with typed data for signing
   */
  async buildAuthorization(
    params: BuildAuthorizationParams
  ): Promise<CreateAuthorizationResponse> {
    const mode = this.getSigningMode(params.address, params.dex)
    let { signerAddress, authorizations } = params

    if (mode === 'USER_AGENT') {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = signerAddress ?? agent.address

      // Auto-inject agentAddress for ApproveAgent authorization
      authorizations = authorizations.map((auth) => {
        if (auth.key === 'ApproveAgent' && !auth.params?.agentAddress) {
          return {
            ...auth,
            params: { ...auth.params, agentAddress: agent.address },
          }
        }
        return auth
      })
    }

    return createAuthorization(this.sdkClient, {
      ...params,
      signerAddress,
      authorizations,
    })
  }

  /**
   * Submit signed authorizations.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Signed authorization parameters
   */
  async submitAuthorizations(
    params: SubmitAuthorizationParams
  ): Promise<AuthorizationsResponse> {
    const mode = this.getSigningMode(params.address, params.dex)
    let { signerAddress } = params

    if (mode === 'USER_AGENT') {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = signerAddress ?? agent.address
    }

    return submitAuthorization(this.sdkClient, { ...params, signerAddress })
  }

  /**
   * Build order payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Order parameters
   * @returns Order actions with typed data for signing
   */
  async buildOrder(params: PlaceOrderParams): Promise<CreateOrderResponse> {
    const mode = this.getSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === 'USER_AGENT') {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = agent.address
    }

    return createOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress,
      clientOrderId: params.clientOrderId,
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
    })
  }

  /**
   * Build cancel order payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Cancel parameters
   * @returns Cancel actions with typed data for signing
   */
  async buildCancelOrder(
    params: CancelOrdersParams
  ): Promise<CancelOrderPayloadResponse> {
    const mode = this.getSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === 'USER_AGENT') {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = agent.address
    }

    return cancelOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress,
      ids: params.ids,
    })
  }

  /**
   * Place an order with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildOrder()` + `submitSignedOrder()`.
   *
   * @param params - Order parameters
   * @returns Order submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async placeOrder(params: PlaceOrderParams): Promise<SubmitOrderResponse> {
    const mode = this.getSigningMode(params.address, params.dex)

    if (mode !== 'USER_AGENT') {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `${PerpsErrorMessage.InvalidSigningMode} placeOrder() requires USER_AGENT mode. Use createOrder() + submitOrder() for USER mode.`
      )
    }

    const agent = await this.sdkClient.agentManager.getAgent(
      params.address,
      params.dex
    )

    // 1. Create order payloads
    const { actions } = await createOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      clientOrderId: params.clientOrderId,
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
    })

    // 2. Sign each action with agent key
    const signedActions: SignedOrderAction[] = await Promise.all(
      actions.map(async (a) => ({
        action: a.action,
        typedData: a.typedData,
        signature: await signTypedData(agent.privateKey, a.typedData),
      }))
    )

    // 3. Submit
    return submitOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      actions: signedActions,
    })
  }

  /**
   * Cancel orders with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildCancelOrder()` + `submitSignedOrder()`.
   *
   * @param params - Cancel parameters
   * @returns Cancel submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async cancelOrders(params: CancelOrdersParams): Promise<SubmitOrderResponse> {
    const mode = this.getSigningMode(params.address, params.dex)

    if (mode !== 'USER_AGENT') {
      throw new PerpsError(
        PerpsErrorCode.ValidationError,
        `${PerpsErrorMessage.InvalidSigningMode} cancelOrders() requires USER_AGENT mode. Use cancelOrder() + submitOrder() for USER mode.`
      )
    }

    const agent = await this.sdkClient.agentManager.getAgent(
      params.address,
      params.dex
    )

    // 1. Create cancel payloads
    const { actions } = await cancelOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      ids: params.ids,
    })

    // 2. Sign each action with agent key
    const signedActions: SignedOrderAction[] = await Promise.all(
      actions.map(async (a) => ({
        action: a.action as OrderActionType,
        typedData: a.typedData,
        signature: await signTypedData(agent.privateKey, a.typedData),
      }))
    )

    // 3. Submit
    return submitOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      actions: signedActions,
    })
  }

  /**
   * Submit pre-signed order actions.
   *
   * Use this for USER mode when you've already signed the actions with the user's wallet.
   * Auto-injects `signerAddress` if not provided (defaults to `address`).
   *
   * @param params - Signed order parameters
   */
  async submitSignedOrder(
    params: SubmitOrderParams
  ): Promise<SubmitOrderResponse> {
    return submitOrder(this.sdkClient, params)
  }

  /**
   * Determine which authorizations (if any) the user needs to sign before trading.
   *
   * Fetches account state and checks the current signing mode to build
   * a precise list of required authorizations.
   *
   * @param params - Parameters including dex, address, and asset requirements
   * @returns Which authorizations are needed and whether the user is ready to trade
   */
  async getRequiredAuthorizations(
    params: GetRequiredAuthorizationsParams
  ): Promise<RequiredAuthorizationsResult> {
    const { dex, address, requireAbstraction = false } = params
    const mode = this.getSigningMode(address, dex)

    // Fetch account state and dex config in parallel
    const [account, dexesResponse] = await Promise.all([
      getAccount(this.sdkClient, { dex, address }),
      getDexes(this.sdkClient),
    ])
    const dexConfig = dexesResponse.dexes.find((d) => d.key === dex)
    const hasBuilderFee =
      dexConfig?.authorizations.some((a) => a.key === 'ApproveBuilderFee') ??
      false
    const rawAbstraction = account.config.abstractionStatus as
      | string
      | null
      | undefined
    const abstractionStatus = rawAbstraction ?? null
    const agents = account.config.agents as
      | Array<{ address: string; validUntil: number }>
      | undefined

    const userAuthorizations: AuthorizationInput[] = []
    const agentAuthorizations: AuthorizationInput[] = []

    if (mode === 'USER') {
      // USER mode: no agent-related authorizations
      if (requireAbstraction && !isAbstractionEnabled(abstractionStatus)) {
        userAuthorizations.push({
          key: 'UserSetAbstraction',
          params: { abstraction: 'unifiedAccount' },
        })
      }

      return {
        userAuthorizations,
        agentAuthorizations,
        agentValid: false,
        abstractionStatus,
        isReady: userAuthorizations.length === 0,
      }
    }

    // USER_AGENT mode: check agent validity
    const agentValid = await this.validateAgent(address, dex, agents)

    if (!agentValid) {
      // Need to approve agent (+ builder fee if configured)
      userAuthorizations.push({ key: 'ApproveAgent' })
      if (hasBuilderFee) {
        userAuthorizations.push({ key: 'ApproveBuilderFee' })
      }

      // Abstraction handling when agent is not yet valid
      if (requireAbstraction && !isAbstractionEnabled(abstractionStatus)) {
        if (abstractionStatus === null) {
          // null → agent can't auto-enable yet (not approved), user must set it
          userAuthorizations.push({
            key: 'UserSetAbstraction',
            params: { abstraction: 'unifiedAccount' },
          })
        } else {
          // 'disabled' → user must re-enable
          userAuthorizations.push({
            key: 'UserSetAbstraction',
            params: { abstraction: 'unifiedAccount' },
          })
        }
      }
    } else {
      // Agent is valid - check abstraction only
      if (requireAbstraction && !isAbstractionEnabled(abstractionStatus)) {
        if (abstractionStatus === null) {
          // null → agent can auto-enable (no user signature needed)
          agentAuthorizations.push({
            key: 'AgentSetAbstraction',
            params: { abstraction: 'unifiedAccount' },
          })
        } else {
          // 'disabled' → user must re-enable
          userAuthorizations.push({
            key: 'UserSetAbstraction',
            params: { abstraction: 'unifiedAccount' },
          })
        }
      }
    }

    const isReady =
      userAuthorizations.length === 0 && agentAuthorizations.length === 0

    return {
      userAuthorizations,
      agentAuthorizations,
      agentValid,
      abstractionStatus,
      isReady,
    }
  }

  /**
   * Execute authorizations: submit user-signed actions, then auto-sign and submit
   * any agent authorizations.
   *
   * @param params - User-signed actions and the required authorizations result
   * @returns Combined results from user and agent submissions
   */
  async executeAuthorizations(
    params: ExecuteAuthorizationsParams
  ): Promise<ExecuteAuthorizationsResult> {
    const { dex, address, required, userSignedActions } = params
    const mode = this.getSigningMode(address, dex)

    // 1. Submit user-signed actions (if any)
    let userResults: AuthorizationsResponse = { results: [] }
    if (userSignedActions.length > 0) {
      const signerAddress =
        mode === 'USER_AGENT'
          ? (await this.sdkClient.agentManager.getAgent(address, dex)).address
          : address
      userResults = await submitAuthorization(this.sdkClient, {
        dex,
        address,
        signerAddress,
        actions: userSignedActions,
      })

      // Check for failures - return early if any user auth failed
      const failed = userResults.results.find((r) => !r.success)
      if (failed) {
        return { userResults }
      }
    }

    // 2. Auto-sign and submit agent authorizations (if any)
    if (required.agentAuthorizations.length > 0 && mode === 'USER_AGENT') {
      const agent = await this.sdkClient.agentManager.getAgent(address, dex)

      // Build typed data for agent authorizations
      const { actions } = await createAuthorization(this.sdkClient, {
        dex,
        address,
        signerAddress: agent.address,
        authorizations: required.agentAuthorizations,
      })

      // Sign with agent key
      const signedAgentActions: SignedAuthorization[] = await Promise.all(
        actions.map(async (action) => ({
          action: action.action,
          typedData: action.typedData,
          signature: await signTypedData(agent.privateKey, action.typedData),
        }))
      )

      // Submit agent-signed actions
      const agentResults = await submitAuthorization(this.sdkClient, {
        dex,
        address,
        signerAddress: agent.address,
        actions: signedAgentActions,
      })

      return { userResults, agentResults }
    }

    return { userResults }
  }

  /**
   * Check if the local agent is registered and valid on the backend.
   */
  private async validateAgent(
    address: Address,
    dex: string,
    backendAgents?: Array<{ address: string; validUntil: number }>
  ): Promise<boolean> {
    const hasLocal = await this.sdkClient.agentManager.hasAgent(address, dex)
    if (!hasLocal) {
      return false
    }

    const agent = await this.sdkClient.agentManager.getAgent(address, dex)
    if (!backendAgents) {
      return false
    }

    const match = backendAgents.find(
      (a) => a.address.toLowerCase() === agent.address.toLowerCase()
    )
    if (!match) {
      return false
    }

    return match.validUntil > Date.now()
  }
}

/**
 * Check if abstraction is enabled based on the status string.
 * Enabled statuses: 'unifiedAccount', 'portfolioMargin'
 * Not enabled: null (never set), 'disabled'
 */
function isAbstractionEnabled(status: string | null): boolean {
  return status !== null && status !== 'disabled'
}
