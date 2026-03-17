import type {
  Address,
  CreateOrderResponse,
  OrderSide,
  OrderType,
  TimeInForce,
  TriggerOrderInput,
} from '@lifi/perps-types'
import type {
  PerpsSDKClient,
  SDKRequestOptions,
} from '../client/createPerpsClient.js'
import { request } from '../utils/request.js'

export interface CreateOrderParams {
  /** DEX to place order on (e.g., 'hyperliquid') */
  dex: string
  /** Wallet address */
  address: Address
  /** Address of the signer (for agent mode, this is the agent address) */
  signerAddress?: Address
  /** Market symbol (e.g., 'BTC') */
  symbol: string
  /** Order side */
  side: OrderSide
  /** Order type */
  type: OrderType
  /** Order size (in base asset) */
  size: string
  /** Order price (required for limit orders) */
  price: string
  /** Leverage for the position */
  leverage?: number
  /** Whether this order only reduces position */
  reduceOnly?: boolean
  /** Time in force */
  timeInForce?: TimeInForce
  /** Expiration time (ISO 8601) */
  expiresAt?: string
  /** Take profit trigger order */
  takeProfit?: TriggerOrderInput
  /** Stop loss trigger order */
  stopLoss?: TriggerOrderInput
  /** Market type: 'spot' or 'perps' (defaults to 'perps') */
  market?: 'spot' | 'perps'
}

/**
 * Create order payloads for signing.
 * Returns typed data that must be signed by the user or agent.
 *
 * @param client - The SDK client instance
 * @param params - Request parameters
 * @param options - Request options (e.g., AbortSignal)
 * @returns Order actions with typed data for signing
 * @throws {PerpsError} On API error responses
 * @throws {PerpsError} On network or parsing errors
 *
 * @remarks
 * The example below uses Hyperliquid. Replace the `dex` value for other DEXes.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({ integrator: 'my-app' })
 * const { actions } = await createOrder(client, {
 *   dex: 'hyperliquid',
 *   address: '0x1234...',
 *   symbol: 'BTC',
 *   side: OrderSide.BUY,
 *   type: OrderType.LIMIT,
 *   size: '0.1',
 *   price: '94000.00',
 *   leverage: 10
 * })
 *
 * // Sign each action with the user's wallet or agent key
 * const signedActions = await Promise.all(
 *   actions.map(async (a) => ({
 *     action: a.action,
 *     typedData: a.typedData,
 *     signature: await walletClient.signTypedData(a.typedData)
 *   }))
 * )
 * ```
 */
export async function createOrder(
  client: PerpsSDKClient,
  params: CreateOrderParams,
  options?: SDKRequestOptions
): Promise<CreateOrderResponse> {
  return request<CreateOrderResponse>(
    client.config,
    `${client.config.apiUrl}/createOrder`,
    {
      method: 'POST',
      body: JSON.stringify({
        dex: params.dex,
        address: params.address,
        signerAddress: params.signerAddress,
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
      }),
    },
    options
  )
}
