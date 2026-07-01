import {
  type ActionSignerContribution,
  type LiquidationEstimateParams,
  PerpsError,
  PerpsErrorMessage,
  type PerpsProviderPlugin,
  type PerpsSDKClient,
  type ProviderAccountExistsParams,
  type ProviderGetAccountParams,
  type ProviderGetActivityParams,
  type ProviderGetFillsParams,
  type ProviderGetOrderParams,
  type ProviderGetOrdersParams,
  type ProviderGetPositionsParams,
  type ProviderGetQuoteParams,
  resolveQuote,
  type SDKRequestOptions,
  type SignActionsContext,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import {
  type AccountConfig,
  type AccountConfigSetting,
  type AccountResponse,
  type AccountSummary,
  type ActionStep,
  ActionType,
  type ActivitiesResponse,
  type FillsResponse,
  type Market,
  type Order,
  type OrdersResponse,
  PerpsErrorCode,
  type PerpsMarket,
  PerpsSigner,
  type Position,
  type PositionsResponse,
  type ProviderAction,
  type Quote,
  type SignedActionStep,
  type SigningMethod,
} from '@lifi/perps-types'
import { type Address, type Hex, isAddress } from 'viem'
import { projectHyperliquidConfigSettings } from './accountConfig.js'
import { getAccountSummary } from './accountSummary.js'
import {
  DEFAULT_HYPERLIQUID_API_URL,
  HYPERLIQUID_FEE_TIER_FALLBACK,
  PROVIDER_KEY,
  SPOT_MARKET_ID,
} from './constants.js'
import { HyperliquidContextRef } from './context.js'
import { getAccount } from './services/getAccount.js'
import { getAccountExists } from './services/getAccountExists.js'
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
import type { HlExtraAgents } from './types/index.js'
import { hlInfoOptions, infoRequest } from './utils/infoClient.js'
import { calculateLiquidationPrice } from './utils/liquidation.js'
import { formatOrderPrice, formatOrderSize } from './utils/orderFormatting.js'

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
 * persistence, and revocation. The base {@link PerpsProviderPlugin} contract
 * stays provider-agnostic — this extension is opt-in for callers that
 * explicitly type against it (e.g. to surface a "revoke agent" affordance).
 */
export interface HyperliquidPerpsProvider extends PerpsProviderPlugin {
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
 * Factory for the Hyperliquid {@link PerpsProviderPlugin}.
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
  const contextRef = new HyperliquidContextRef(apiUrl)

  const toLowerAddress = (value: unknown): string | null =>
    typeof value === 'string' && isAddress(value) ? value.toLowerCase() : null

  const toValidUntilMs = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }

  const isKnownExpiredRemoteAgent = async (
    address: Address,
    localAgentAddress: Address
  ): Promise<boolean> => {
    let context: ReturnType<typeof contextRef.require> | null = null
    try {
      context = contextRef.require()
    } catch {
      // Unbound provider (e.g. direct unit tests) cannot query /info.
      return false
    }
    const agents = await infoRequest<HlExtraAgents>(
      apiUrl,
      { type: 'extraAgents', user: address },
      hlInfoOptions(context.client)
    )
    const local = localAgentAddress.toLowerCase()
    const match = agents.find(
      (agent) => toLowerAddress(agent.address) === local
    ) as Record<string, unknown> | undefined
    if (!match) {
      return false
    }
    const validUntilMs = toValidUntilMs(match.validUntil)
    return validUntilMs !== null && validUntilMs <= Date.now()
  }

  const resolveApproveAgentAddress = async (
    address: Address
  ): Promise<Address> => {
    try {
      const localAgent = await agentStore.get(address)
      try {
        if (await isKnownExpiredRemoteAgent(address, localAgent.address)) {
          await agentStore.remove(address)
          return (await agentStore.getOrCreate(address)).address
        }
      } catch {
        // If the upstream extra-agent probe fails, keep the existing local key.
      }
      return localAgent.address
    } catch (error) {
      if (
        error instanceof PerpsError &&
        error.message === PerpsErrorMessage.AgentNotFound
      ) {
        return (await agentStore.getOrCreate(address)).address
      }
      throw error
    }
  }

  return {
    type: PROVIDER_KEY,

    bind: (client: PerpsSDKClient): void => contextRef.bind(client),

    getAgentAddress: async (address: Address): Promise<Address> =>
      (await agentStore.get(address)).address,

    hasAgent: (address: Address): Promise<boolean> => agentStore.has(address),

    removeAgent: (address: Address): Promise<void> =>
      agentStore.remove(address),

    importAgent: (
      address: Address,
      privateKey: Hex
    ): Promise<HyperliquidAgent> => agentStore.import(address, privateKey),

    resolveActionRequest: async (
      action: ActionType,
      address: Address,
      signers: PerpsSigner[]
    ): Promise<ActionSignerContribution> => {
      // APPROVE_AGENT is user-signed: the user authorises the agent, so the
      // agent address rides as a param (not signerAddress). The agent is
      // provisioned on first use so its address is known before the backend
      // builds the typed data.
      if (action === ActionType.APPROVE_AGENT) {
        const agentAddress = await resolveApproveAgentAddress(address)
        return { params: { agentAddress } }
      }
      // Agent-signed actions (trades, account-mode) carry the agent as the
      // on-wire signerAddress. User-signed actions (builder-fee, withdrawal)
      // contribute nothing — core submits under the user's own address.
      if (signers.includes(PerpsSigner.AGENT)) {
        const agent = await agentStore.get(address)
        return { signerAddress: agent.address }
      }
      return {}
    },

    signActions: (
      method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> =>
      hyperliquidSignActions(agentStore, method, steps, address, ctx),

    getAccount: (
      params: ProviderGetAccountParams,
      opts?: SDKRequestOptions
    ): Promise<AccountResponse> =>
      getAccount(contextRef.require(), { address: params.address }, opts),

    accountExists: (
      params: ProviderAccountExistsParams,
      opts?: SDKRequestOptions
    ): Promise<boolean> =>
      getAccountExists(contextRef.require(), { address: params.address }, opts),

    getPositions: (
      params: ProviderGetPositionsParams,
      opts?: SDKRequestOptions
    ): Promise<PositionsResponse> =>
      getPositions(
        contextRef.require(),
        {
          address: params.address,
          marketId: params.marketId,
          limit: params.limit,
        },
        opts
      ),

    getOrders: (
      params: ProviderGetOrdersParams,
      opts?: SDKRequestOptions
    ): Promise<OrdersResponse> =>
      getOrders(
        contextRef.require(),
        {
          address: params.address,
          marketId: params.marketId,
          limit: params.limit,
        },
        opts
      ),

    getOrder: (
      params: ProviderGetOrderParams,
      opts?: SDKRequestOptions
    ): Promise<Order> =>
      getOrder(
        contextRef.require(),
        { address: params.address, id: params.id },
        opts
      ),

    getFills: (
      params: ProviderGetFillsParams,
      opts?: SDKRequestOptions
    ): Promise<FillsResponse> =>
      getFills(
        contextRef.require(),
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
      params: ProviderGetActivityParams,
      opts?: SDKRequestOptions
    ): Promise<ActivitiesResponse> =>
      getActivity(
        contextRef.require(),
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

    getQuote: (
      params: ProviderGetQuoteParams,
      opts?: SDKRequestOptions
    ): Promise<Quote> =>
      resolveQuote(
        contextRef.require().client,
        PROVIDER_KEY,
        params,
        HYPERLIQUID_FEE_TIER_FALLBACK,
        opts
      ),

    getAccountSummary: (
      account: AccountResponse,
      positions: Position[]
    ): AccountSummary => getAccountSummary(account, positions),

    formatOrderPrice: (market: Market, price: number): string =>
      formatOrderPrice(
        price,
        market.szDecimals,
        market.categoryId === SPOT_MARKET_ID ? 'spot' : undefined
      ),

    formatOrderSize: (market: Market, size: number): string =>
      formatOrderSize(size, market.szDecimals),

    estimateLiquidationPrice: (
      market: PerpsMarket,
      params: LiquidationEstimateParams
    ): number | undefined =>
      calculateLiquidationPrice(
        params.entryPrice,
        params.leverage,
        params.isLong,
        market.maxLeverage
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
