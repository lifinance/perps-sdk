import {
  PerpsError,
  type PerpsProvider,
  type PerpsSDKClient,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetFillsParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type SDKRequestOptions,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  type AccountConfig,
  type AccountConfigSetting,
  type AccountResponse,
  type ActionStep,
  type ActivitiesResponse,
  type FillsResponse,
  type Order,
  type OrdersResponse,
  PerpsErrorCode,
  type PositionsResponse,
  type ProviderAction,
  type SignedActionStep,
  type SigningMethod,
} from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { projectHyperliquidConfigSettings } from './accountConfig.js'
import { DEFAULT_HYPERLIQUID_API_URL, PROVIDER_KEY } from './constants.js'
import { getAccount } from './services/getAccount.js'
import { getActivity } from './services/getActivity.js'
import { getFills } from './services/getFills.js'
import { getOrder } from './services/getOrder.js'
import { getOrders } from './services/getOrders.js'
import { getPositions } from './services/getPositions.js'
import {
  type HyperliquidAgent,
  HyperliquidAgentStore,
} from './signers/HyperliquidAgentStore.js'
import { hyperliquidSignActions } from './signers/signActions.js'

/**
 * Options for {@link hyperliquidProvider}.
 *
 * @public
 */
export interface HyperliquidProviderOptions {
  /**
   * Base URL for the Hyperliquid REST surface. Defaults to
   * `https://api.hyperliquid.xyz`. Override to point at a custom or
   * third-party endpoint — e.g. a reverse proxy, a self-hosted mirror, or a
   * rate-limit-managed gateway in front of Hyperliquid.
   */
  apiUrl?: string
  /**
   * Storage adapter for the user's per-address Hyperliquid agent keypair.
   * Defaults to browser `localStorage`. Pass a custom adapter for SSR /
   * non-browser hosts or encrypted storage.
   */
  storage?: StorageAdapter
}

/**
 * Hyperliquid provider plugin extended with agent-keypair lifecycle methods.
 * Hyperliquid signs trading actions with a per-user agent wallet the user
 * approves via `APPROVE_AGENT`; the plugin owns that keypair's generation,
 * persistence, and revocation. The base {@link PerpsProvider} contract stays
 * provider-agnostic — this extension is opt-in for callers that explicitly
 * type against it (e.g. to surface a "revoke agent" affordance).
 */
export interface HyperliquidPerpsProvider extends PerpsProvider {
  /** Resolve the agent wallet address, throwing if none has been created. */
  getAgentAddress(address: Address): Promise<Address>
  /** Whether an agent keypair exists for the user address. */
  hasAgent(address: Address): Promise<boolean>
  /** Remove the user's agent keypair (revoke local authorization). */
  removeAgent(address: Address): Promise<void>
  /** Import an existing agent keypair for the user address. */
  importAgent(address: Address, privateKey: Hex): Promise<HyperliquidAgent>
}

/**
 * Factory for the Hyperliquid {@link PerpsProvider} plugin.
 *
 * Account-specific state is read direct from `${apiUrl}/info`; enriched asset
 * metadata and public/shared data come from the LI.FI backend (Valkey-cached).
 * Pass to `createPerpsClient({ providers: [hyperliquidProvider()] })` and look
 * up via `client.getProvider('hyperliquid')`.
 *
 * Write actions are EIP-712 typed data signed by the user's Hyperliquid agent
 * keypair; the plugin owns that keypair (generation, storage, revocation) and
 * dispatches the agent-signed arm via `signActions`.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   providers: [hyperliquidProvider()],
 * })
 * ```
 * @public
 */
export function hyperliquidProvider(
  options: HyperliquidProviderOptions = {}
): HyperliquidPerpsProvider {
  const apiUrl = options.apiUrl ?? DEFAULT_HYPERLIQUID_API_URL
  const agentStore = new HyperliquidAgentStore(options.storage)

  return {
    type: PROVIDER_KEY,

    getAgentAddress: async (address: Address): Promise<Address> =>
      (await agentStore.get(address)).address,

    hasAgent: (address: Address): Promise<boolean> => agentStore.has(address),

    removeAgent: (address: Address): Promise<void> =>
      agentStore.remove(address),

    importAgent: (
      address: Address,
      privateKey: Hex
    ): Promise<HyperliquidAgent> => agentStore.import(address, privateKey),

    resolveSignerAddress: async (
      address: Address,
      opts?: { create?: boolean }
    ): Promise<Address> => {
      const agent = opts?.create
        ? await agentStore.getOrCreate(address)
        : await agentStore.get(address)
      return agent.address
    },

    signActions: (
      method: SigningMethod,
      steps: ActionStep[],
      address: Address
    ): Promise<SignedActionStep[]> =>
      hyperliquidSignActions(agentStore, method, steps, address),

    getAccount: (
      client: PerpsSDKClient,
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> =>
      getAccount(client, apiUrl, { address: params.address }, opts),

    getPositions: (
      client: PerpsSDKClient,
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> =>
      getPositions(
        client,
        apiUrl,
        {
          address: params.address,
          marketId: params.marketId,
          limit: params.limit,
        },
        opts
      ),

    getOrders: (
      client: PerpsSDKClient,
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> =>
      getOrders(
        client,
        apiUrl,
        {
          address: params.address,
          marketId: params.marketId,
          limit: params.limit,
        },
        opts
      ),

    getOrder: (
      client: PerpsSDKClient,
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> =>
      getOrder(
        client,
        apiUrl,
        { address: params.address, id: params.id },
        opts
      ),

    getFills: (
      client: PerpsSDKClient,
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> =>
      getFills(
        client,
        apiUrl,
        {
          address: params.address,
          limit: params.limit,
          cursor: params.cursor,
          startTime: params.startTime,
          endTime: params.endTime,
        },
        opts
      ),

    getActivity: (
      client: PerpsSDKClient,
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> =>
      getActivity(
        client,
        apiUrl,
        {
          address: params.address,
          limit: params.limit,
          cursor: params.cursor,
          startTime: params.startTime,
          endTime: params.endTime,
          type: params.type,
        },
        opts
      ),

    projectConfig: (
      config: AccountConfig,
      setup: ProviderAction[],
      options: ProviderAction[]
    ): AccountConfigSetting[] => {
      if (config.provider !== PROVIDER_KEY) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `hyperliquidProvider.projectConfig received config for provider ` +
            `'${config.provider}'.`
        )
      }
      return projectHyperliquidConfigSettings(config, setup, options)
    },
  }
}
