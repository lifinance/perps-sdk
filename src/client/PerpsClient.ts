import type {
  Address,
  Authorization,
  AuthorizationInput,
  AuthorizationsResponse,
  CancelOrderPayloadResponse,
  CreateAuthorizationResponse,
  CreateOrderResponse,
  CreateWithdrawalResponse,
  Dex,
  ModifyOrderPayloadResponse,
  OrderActionType,
  PositionActionType,
  SignedAuthorization,
  SignedOrderAction,
  SignedPositionAction,
  SubmitOrderResponse,
  SubmitPositionResponse,
  SubmitWithdrawalResponse,
  UpdatePositionMarginRequest,
  UpdatePositionMarginResponse,
} from '@lifi/perps-types'
import { OrderType, PerpsErrorCode, PerpsSigner } from '@lifi/perps-types'
import { localStorageAdapter } from '../agent/storage.js'
import type { StorageAdapter } from '../agent/types.js'
import { PerpsErrorMessage } from '../errors/constants.js'
import { PerpsError } from '../errors/PerpsError.js'
import { cancelOrder } from '../services/cancelOrder.js'
import { createAuthorization } from '../services/createAuthorization.js'
import { createOrder } from '../services/createOrder.js'
import { createWithdrawal } from '../services/createWithdrawal.js'
import { getDexes } from '../services/getDexes.js'
import { modifyOrder } from '../services/modifyOrder.js'
import type { SubmitAuthorizationParams } from '../services/submitAuthorization.js'
import { submitAuthorization } from '../services/submitAuthorization.js'
import type { SubmitOrderParams } from '../services/submitOrder.js'
import { submitOrder } from '../services/submitOrder.js'
import type { SubmitPositionParams } from '../services/submitPosition.js'
import { submitPosition } from '../services/submitPosition.js'
import type { SubmitWithdrawalParams } from '../services/submitWithdrawal.js'
import { submitWithdrawal } from '../services/submitWithdrawal.js'
import { updatePositionMargin as updatePositionMarginService } from '../services/updatePositionMargin.js'
import { signTypedData } from '../utils/signTypedData.js'
import { createPerpsClient, type PerpsSDKClient } from './createPerpsClient.js'
import {
  type BuildAuthorizationParams,
  type BuildWithdrawalParams,
  type CancelOrdersParams,
  type ExecuteAuthorizationsParams,
  type ExecuteAuthorizationsResult,
  type GetRequiredAuthorizationsParams,
  type ModifyOrdersParams,
  type PerpsClientOptions,
  type PlaceOrderParams,
  type PlaceTriggerOrderParams,
  type RequiredAuthorizationsResult,
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
 * @remarks
 * The example below uses Hyperliquid. Authorization keys and parameters are DEX-specific.
 *
 * @example
 * ```ts
 * const perps = new PerpsClient({ integrator: 'my-app', apiKey: 'your-api-key' })
 *
 * // Set up agent signing for a user + DEX pair
 * await perps.setSigningMode(userAddress, 'hyperliquid', 'USER_AGENT')
 *
 * // Check and execute required authorizations
 * const required = await perps.getRequiredAuthorizations({
 *   dex: 'hyperliquid',
 *   address: userAddress,
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
  private storage: StorageAdapter
  private signingModes: Map<string, SigningMode> = new Map()
  private dexMetadataCache: Map<string, Dex> = new Map()

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
   * Get the underlying SDK client for use with service functions.
   */
  get client(): PerpsSDKClient {
    return this.sdkClient
  }

  /**
   * Get the in-memory map key for a user + DEX pair.
   */
  private modeKey(address: Address, dex: string): string {
    return `${address.toLowerCase()}:${dex.toLowerCase()}`
  }

  /**
   * Get the storage key for persisting signing mode.
   */
  private signingModeStorageKey(address: Address, dex: string): string {
    return `lifi-perps-mode:${address.toLowerCase()}:${dex.toLowerCase()}`
  }

  /**
   * Fetch and cache DEX metadata from the backend.
   */
  private async getDexMetadata(dex: string): Promise<Dex> {
    const cached = this.dexMetadataCache.get(dex)
    if (cached) {
      return cached
    }

    const { dexes } = await getDexes(this.sdkClient)
    for (const d of dexes) {
      this.dexMetadataCache.set(d.key, d)
    }

    const metadata = this.dexMetadataCache.get(dex)
    if (!metadata) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `Unsupported dex: ${dex}`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }
    return metadata
  }

  /**
   * Build authorization inputs from DEX metadata based on signing mode.
   */
  private buildAuthInputsFromMetadata(
    authorizations: Authorization[],
    mode: SigningMode,
    agentAddress?: Address
  ): AuthorizationInput[] {
    return authorizations
      .filter((auth) => {
        // Skip user-initiated authorizations — they are invoked on-demand
        if (auth.usage === 'user') {
          return false
        }
        if (mode === SigningMode.USER) {
          if (auth.signer !== PerpsSigner.USER) {
            return false
          }
          // Skip auths that require an agentAddress — no agent in USER mode
          if (auth.params?.some((p) => p.name === 'agentAddress')) {
            return false
          }
          return true
        }
        // In USER_AGENT mode, skip UserSetAbstraction (user-mode only)
        if (
          auth.signer === PerpsSigner.USER &&
          auth.key === 'UserSetAbstraction'
        ) {
          return false
        }
        return true
      })
      .map((auth) => {
        const params: Record<string, unknown> = {}
        // Fill agentAddress param if declared and agent exists
        if (
          auth.params?.some((p) => p.name === 'agentAddress') &&
          agentAddress
        ) {
          params.agentAddress = agentAddress
        }
        return {
          key: auth.key,
          ...(Object.keys(params).length > 0 ? { params } : {}),
        }
      })
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

    // Persist to storage so mode survives page refreshes
    await this.storage.set(this.signingModeStorageKey(address, dex), mode)

    if (mode === SigningMode.USER_AGENT) {
      // Generate agent keypair if not exists
      await this.sdkClient.agentManager.getOrCreateAgent(address, dex)
    }
  }

  /**
   * Get the current signing mode for a user + DEX pair.
   * Defaults to `USER_AGENT` if not explicitly set.
   */
  getSigningMode(address: Address, dex: string): SigningMode {
    return (
      this.signingModes.get(this.modeKey(address, dex)) ??
      SigningMode.USER_AGENT
    )
  }

  /**
   * Load the persisted signing mode from storage into the in-memory map.
   * Call this on startup / page refresh to rehydrate before using getSigningMode().
   * Returns the loaded mode (defaults to 'USER_AGENT' if nothing persisted).
   */
  async loadSigningMode(address: Address, dex: string): Promise<SigningMode> {
    const key = this.modeKey(address, dex)
    // Already loaded — skip storage read
    if (this.signingModes.has(key)) {
      return this.signingModes.get(key)!
    }

    const stored = await this.storage.get(
      this.signingModeStorageKey(address, dex)
    )
    const mode: SigningMode =
      stored === SigningMode.USER_AGENT || stored === SigningMode.USER
        ? stored
        : SigningMode.USER_AGENT
    this.signingModes.set(key, mode)
    return mode
  }

  /**
   * Load the persisted agent mode preference.
   * Returns true if USER_AGENT mode is persisted, false otherwise.
   * Use this on startup to rehydrate the UI toggle state.
   */
  async loadAgentMode(address: Address, dex: string): Promise<boolean> {
    const mode = await this.loadSigningMode(address, dex)
    return mode === SigningMode.USER_AGENT
  }

  /**
   * Set whether agent signing is enabled for a user + DEX pair.
   * Convenience wrapper around setSigningMode for boolean toggle UIs.
   */
  async setAgentMode(
    address: Address,
    dex: string,
    useAgent: boolean
  ): Promise<void> {
    await this.setSigningMode(
      address,
      dex,
      useAgent ? SigningMode.USER_AGENT : SigningMode.USER
    )
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
    await this.storage.remove(this.signingModeStorageKey(address, dex))
  }

  /**
   * Build authorization payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Authorization parameters
   * @returns Authorization actions with typed data for signing
   */
  async buildAuthorization(
    params: BuildAuthorizationParams
  ): Promise<CreateAuthorizationResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)
    let { signerAddress } = params

    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = signerAddress ?? agent.address
    }

    return createAuthorization(this.sdkClient, {
      ...params,
      signerAddress,
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
    const mode = await this.loadSigningMode(params.address, params.dex)
    let { signerAddress } = params

    if (mode === SigningMode.USER_AGENT) {
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
    const mode = await this.loadSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === SigningMode.USER_AGENT) {
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
    const mode = await this.loadSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === SigningMode.USER_AGENT) {
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
   * Build modify order payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Modify parameters
   * @returns Modify actions with typed data for signing
   */
  async buildModifyOrder(
    params: ModifyOrdersParams
  ): Promise<ModifyOrderPayloadResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = agent.address
    }

    return modifyOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress,
      symbol: params.symbol,
      side: params.side,
      modifications: params.modifications,
    })
  }

  /**
   * Modify orders with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildModifyOrder()` + `submitSignedOrder()`.
   *
   * @param params - Modify parameters
   * @returns Modify submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async modifyOrders(params: ModifyOrdersParams): Promise<SubmitOrderResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)

    if (mode !== SigningMode.USER_AGENT) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `${PerpsErrorMessage.InvalidSigningMode} modifyOrders() requires USER_AGENT mode. Use modifyOrder() + submitOrder() for USER mode.`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }

    const agent = await this.sdkClient.agentManager.getAgent(
      params.address,
      params.dex
    )

    // 1. Create modify payloads
    const { actions } = await modifyOrder(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      symbol: params.symbol,
      side: params.side,
      modifications: params.modifications,
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
   * Place an order with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildOrder()` + `submitSignedOrder()`.
   *
   * @param params - Order parameters
   * @returns Order submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async placeOrder(params: PlaceOrderParams): Promise<SubmitOrderResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)

    if (mode !== SigningMode.USER_AGENT) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `${PerpsErrorMessage.InvalidSigningMode} placeOrder() requires USER_AGENT mode. Use createOrder() + submitOrder() for USER mode.`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
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
   * Build trigger-only order payloads (TP/SL on existing positions).
   *
   * In `USER` mode, returns actions for the user to sign with their wallet.
   * In `USER_AGENT` mode, auto-injects the agent address as signer.
   *
   * @param params - Trigger order parameters
   * @returns Order actions with typed data for signing
   */
  async buildTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<CreateOrderResponse> {
    return this.buildOrder({
      ...params,
      type: OrderType.TRIGGER_ONLY,
      price: '0',
    })
  }

  /**
   * Place trigger-only orders (TP/SL on existing positions) with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildTriggerOrder()` + wallet sign + `submitSignedOrder()`.
   *
   * @param params - Trigger order parameters
   * @returns Order submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async placeTriggerOrder(
    params: PlaceTriggerOrderParams
  ): Promise<SubmitOrderResponse> {
    return this.placeOrder({
      ...params,
      type: OrderType.TRIGGER_ONLY,
      price: '0',
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
    const mode = await this.loadSigningMode(params.address, params.dex)

    if (mode !== SigningMode.USER_AGENT) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `${PerpsErrorMessage.InvalidSigningMode} cancelOrders() requires USER_AGENT mode. Use cancelOrder() + submitOrder() for USER mode.`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
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

  // ---------------------------------------------------------------------------
  // Position margin
  // ---------------------------------------------------------------------------

  /**
   * Build position margin update payloads for signing.
   *
   * In `USER` mode, `signerAddress` is omitted (backend defaults to `address`).
   * In `USER_AGENT` mode, auto-injects the agent address as `signerAddress`.
   *
   * @param params - Position margin parameters
   * @returns Position actions with typed data for signing
   */
  async buildPositionMargin(
    params: Omit<UpdatePositionMarginRequest, 'signerAddress'>
  ): Promise<UpdatePositionMarginResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)
    let signerAddress: Address | undefined

    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getAgent(
        params.address,
        params.dex
      )
      signerAddress = agent.address
    }

    return updatePositionMarginService(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress,
      symbol: params.symbol,
      action: params.action,
      amount: params.amount,
    })
  }

  /**
   * Update position margin with automatic agent signing.
   *
   * **Requires USER_AGENT mode.** For USER mode, use `buildPositionMargin()` + `submitSignedPosition()`.
   *
   * @param params - Position margin parameters
   * @returns Position submission results
   * @throws {PerpsError} If not in USER_AGENT mode
   */
  async updatePositionMargin(
    params: Omit<UpdatePositionMarginRequest, 'signerAddress'>
  ): Promise<SubmitPositionResponse> {
    const mode = await this.loadSigningMode(params.address, params.dex)

    if (mode !== SigningMode.USER_AGENT) {
      const error = new PerpsError(
        PerpsErrorCode.SDKError,
        `${PerpsErrorMessage.InvalidSigningMode} updatePositionMargin() requires USER_AGENT mode. Use buildPositionMargin() + submitSignedPosition() for USER mode.`
      )
      error.tool = '@lifi/perps-sdk'
      throw error
    }

    const agent = await this.sdkClient.agentManager.getAgent(
      params.address,
      params.dex
    )

    // 1. Create position margin payloads
    const { actions } = await updatePositionMarginService(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      symbol: params.symbol,
      action: params.action,
      amount: params.amount,
    })

    // 2. Sign each action with agent key
    const signedActions: SignedPositionAction[] = await Promise.all(
      actions.map(async (a) => ({
        action: a.action as PositionActionType,
        typedData: a.typedData,
        signature: await signTypedData(agent.privateKey, a.typedData),
      }))
    )

    // 3. Submit
    return submitPosition(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      signerAddress: agent.address,
      actions: signedActions,
    })
  }

  /**
   * Submit pre-signed position actions.
   *
   * Use this for USER mode when you've already signed the actions with the user's wallet.
   *
   * @param params - Signed position parameters
   */
  async submitSignedPosition(
    params: SubmitPositionParams
  ): Promise<SubmitPositionResponse> {
    return submitPosition(this.sdkClient, params)
  }

  /**
   * Build a withdrawal payload for the user to sign.
   *
   * Withdrawals are user-signed only — agents cannot initiate withdrawals.
   * No agent injection is performed regardless of signing mode.
   *
   * @param params - Withdrawal parameters
   * @returns Withdrawal action with typed data for signing
   */
  async buildWithdrawal(
    params: BuildWithdrawalParams
  ): Promise<CreateWithdrawalResponse> {
    return createWithdrawal(this.sdkClient, {
      dex: params.dex,
      address: params.address,
      withdrawal: params.withdrawal,
    })
  }

  /**
   * Submit a signed withdrawal.
   *
   * Withdrawals are user-signed only — agents cannot initiate withdrawals.
   *
   * @param params - Signed withdrawal parameters
   * @returns Withdrawal result
   */
  async submitWithdrawal(
    params: SubmitWithdrawalParams
  ): Promise<SubmitWithdrawalResponse> {
    return submitWithdrawal(this.sdkClient, params)
  }

  /**
   * Determine which authorizations (if any) the user needs to sign before trading.
   *
   * Fetches DEX metadata from the backend to determine what authorizations to request,
   * then calls buildAuthorization — the backend filters already-valid auths
   * and returns only what's needed. Categorizes results by the `signer` field
   * from the response.
   *
   * @param params - Parameters including dex, address, and dex-specific config
   * @returns Which authorizations are needed and whether the user is ready to trade
   */
  async getRequiredAuthorizations(
    params: GetRequiredAuthorizationsParams
  ): Promise<RequiredAuthorizationsResult> {
    const { dex, address } = params
    const mode = await this.loadSigningMode(address, dex)

    // Ensure agent exists in USER_AGENT mode
    let agentAddress: Address | undefined
    if (mode === SigningMode.USER_AGENT) {
      const agent = await this.sdkClient.agentManager.getOrCreateAgent(
        address,
        dex
      )
      agentAddress = agent.address
    }

    // Fetch metadata and build inputs
    const metadata = await this.getDexMetadata(dex)
    const allInputs = this.buildAuthInputsFromMetadata(
      metadata.authorizations,
      mode,
      agentAddress
    )

    if (allInputs.length === 0) {
      return { userAuthorizations: [], agentAuthorizations: [], isReady: true }
    }

    // Send ALL to backend — it filters already-satisfied ones and returns typed data
    const { actions } = await this.buildAuthorization({
      dex,
      address,
      authorizations: allInputs,
    })

    if (actions.length === 0) {
      return { userAuthorizations: [], agentAuthorizations: [], isReady: true }
    }

    // Categorize by the signer field from the backend response
    const userAuthorizations = actions.filter(
      (a) => a.signer === PerpsSigner.USER
    )
    const agentAuthorizations = actions.filter(
      (a) => a.signer === PerpsSigner.AGENT
    )

    return {
      userAuthorizations,
      agentAuthorizations,
      isReady: false,
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
    const mode = await this.loadSigningMode(address, dex)

    // 1. Submit user-signed actions (if any)
    let userResults: AuthorizationsResponse = { results: [] }
    if (userSignedActions.length > 0) {
      const signerAddress =
        mode === SigningMode.USER_AGENT
          ? (await this.sdkClient.agentManager.getAgent(address, dex)).address
          : address
      userResults = await submitAuthorization(this.sdkClient, {
        dex,
        address,
        signerAddress,
        actions: userSignedActions,
      })

      // Check for mandatory failures - return early if any non-optional user auth failed
      const optionalActions = new Set(
        required.userAuthorizations
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

    // 2. Auto-sign and submit agent authorizations (if any)
    // Typed data already built by getRequiredAuthorizations — just sign and submit
    if (
      required.agentAuthorizations.length > 0 &&
      mode === SigningMode.USER_AGENT
    ) {
      const agent = await this.sdkClient.agentManager.getAgent(address, dex)

      const signedAgentActions: SignedAuthorization[] = await Promise.all(
        required.agentAuthorizations.map(async (action) => ({
          action: action.action,
          typedData: action.typedData,
          signature: await signTypedData(agent.privateKey, action.typedData),
        }))
      )

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
}
