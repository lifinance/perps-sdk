import type { AcceptTermsParams } from './acceptTerms.js'
import type {
  ActionType,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsErrorCode,
  TimeInForce,
  TriggerCondition,
  TwapOrderStatus,
} from './enums.js'
import type { MarketDisplay, MarketRef } from './market.js'
import type { Address, Hex } from './primitives.js'
import type { CreateReferralCodeParams, OnboardParams } from './referral.js'
import type { PerpsTypedData } from './typedData.js'

/**
 * Unsigned EIP-712 action step containing typed data for client signing.
 *
 * @public
 */
export interface Eip712ActionStep {
  action: ActionType
  typedData: PerpsTypedData
}

/**
 * Unsigned WASM-blob action step containing provider-specific signing
 * parameters for the client.
 *
 * @public
 */
export interface WasmBlobActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
}

/**
 * An unencoded viem-style contract call crossing the backend→SDK boundary as an
 * `EVM_TX` step's `txParams`. The call is encoded SDK-side (viem `parseAbi` +
 * `writeContract`), so `abi` holds human-readable signatures rather than a viem
 * `Abi` — keeping `perps-types` viem-free.
 * @public
 */
export interface EvmCall {
  chainId: number
  to: Address
  functionName: string
  /** Function arguments supplied to the contract call in declaration order. */
  args: readonly unknown[]
  /** Human-readable ABI signatures, e.g. `'function approve(address,uint256) returns (bool)'`, fed to viem `parseAbi`. */
  abi: readonly string[]
}

/**
 * Unsigned EVM transaction action step. `txParams` describes the call that the
 * client encodes and submits.
 *
 * @public
 */
export interface EvmTxActionStep {
  action: ActionType
  txParams: EvmCall
}

/**
 * A venue request crossing the backend→SDK boundary unsigned. The SDK computes
 * a per-request HMAC signature from a client-held API key, attaches it as a
 * structured `hmac` field (yielding an {@link HmacSignedActionStep}), and the
 * signed step rides the normal `executeAction` path.
 * @public
 */
export interface HmacActionStep {
  action: ActionType
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE'
    /** Venue-relative, e.g. `/v1/perps/orders`; base URL resolution is provider-side. */
    path: string
    /**
     * Pre-serialized request body that transits verbatim — the exact byte
     * string the HMAC signature covers, never re-serialized downstream.
     */
    body?: string
  }
}

/**
 * A marker for a client-only setup step the SDK executes directly against the
 * venue with the provider session token. `session` may carry a small,
 * the deposit-address policy marker, but never a venue path, request headers,
 * or credentials. The provider authors the venue call itself, keyed on `action`,
 * and the signing arm returns no signed step, so `executeAction` is skipped.
 * @public
 */
export interface CreateDepositAddressSessionMarker {
  /** Source network for the provider deposit address. */
  network: 'ethereum'
  /** Deposit asset symbol; currently constrained to USDC. */
  symbol: 'USDC'
  /** Provider wallet destination policy; currently constrained to margin. */
  depositDestination: { wallet: 'margin' }
}

/**
 * Client-only session action step, with a provider session request marker or
 * an empty session payload for actions that do not need one.
 *
 * @public
 */
export type SessionActionStep =
  | {
      action: Exclude<ActionType, ActionType.CREATE_DEPOSIT_ADDRESS>
      session: Record<string, never>
    }
  | {
      action: ActionType.CREATE_DEPOSIT_ADDRESS
      session: CreateDepositAddressSessionMarker
    }

/**
 * Unsigned SIWE action step containing the backend-issued login challenge.
 *
 * @public
 */
export interface SiweActionStep {
  action: ActionType
  siwe: {
    /** Backend identifier for the SIWE challenge. */
    challengeId: string
    /** The backend-built ERC-4361 challenge the wallet must `personal_sign`. */
    message: string
  }
}

/**
 * Union of all unsigned action-step encodings produced by `createAction`.
 *
 * @public
 */
export type ActionStep =
  | Eip712ActionStep
  | WasmBlobActionStep
  | EvmTxActionStep
  | HmacActionStep
  | SessionActionStep
  | SiweActionStep

/**
 * Signed EIP-712 action step ready for backend execution.
 *
 * @public
 */
export interface Eip712SignedActionStep {
  action: ActionType
  typedData: PerpsTypedData
  signature: Hex
}

/**
 * Signed WASM-blob action step, including provider wire transaction details.
 *
 * @public
 */
export interface WasmBlobSignedActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
  signedTx: {
    txType: number
    txInfo: string
    txHash: string
  }
}

/**
 * Signed EVM transaction action step with the submitted transaction hash.
 *
 * @public
 */
export interface EvmTxSignedActionStep {
  action: ActionType
  txParams: EvmCall
  txHash: string
}

/**
 * HMAC-authenticated venue request ready for backend execution.
 *
 * @public
 */
export interface HmacSignedActionStep {
  action: ActionType
  request: HmacActionStep['request']
  /**
   * Per-request HMAC material computed SDK-side; the backend builds the venue's
   * transport headers from it at relay time.
   */
  hmac: {
    keyId: string
    /** Sign-time Unix timestamp in milliseconds; part of the signed message. */
    timestampMs: number
    signature: string
  }
}

/**
 * Signed SIWE login action step.
 *
 * @public
 */
export interface SiweSignedActionStep {
  action: ActionType
  siwe: SiweActionStep['siwe']
  signature: Hex
}

/**
 * Union of all signed action-step encodings accepted by `executeAction`.
 *
 * @public
 */
export type SignedActionStep =
  | Eip712SignedActionStep
  | WasmBlobSignedActionStep
  | EvmTxSignedActionStep
  | HmacSignedActionStep
  | SiweSignedActionStep

/**
 * Per-action execution result. Success arms may include a provider order id and
 * the venue transaction it was submitted in; failure arms carry a message and
 * optional structured error code.
 *
 * @public
 */
export type ActionResult =
  | {
      action: ActionType
      success: true
      orderId?: string
      /** Provider-native identifier for a placed TWAP parent order. */
      twapId?: string
      /**
       * Venue transaction hash, present only where the venue's canonical hash is
       * known at submit time (Lighter). Hyperliquid assigns its hash at block
       * inclusion and Ondo settles offchain, so neither returns one here.
       */
      txHash?: string
      /** Fully-resolved block-explorer URL for `txHash`; absent when the hash is
       * absent or the provider has no explorer configured. */
      explorerLink?: string
    }
  | {
      action: ActionType
      success: false
      error: string
      /** Structured classification of the failure, when the backend can provide one. */
      errorCode?: PerpsErrorCode
    }

/**
 * Trigger prices used to configure take-profit or stop-loss behavior.
 * Prices are decimal strings in the market's quote currency.
 *
 * @public
 */
export interface TriggerOrderInput {
  triggerPrice: string
  limitPrice?: string
  /**
   * Base-asset size the trigger closes. Omitted covers the entire position,
   * tracking later size changes; set, it is a fixed partial amount.
   */
  size?: string
}

/**
 * Mutable fields for an existing order, identified by venue order id.
 *
 * @public
 */
export interface ModifyOrderInput {
  id: string
  price?: string
  size?: string
  triggerPrice?: string
  limitPrice?: string
}

/**
 * Normalized order returned by a provider, including lifecycle and trigger
 * metadata. Quantities and prices are decimal strings.
 *
 * @public
 */
export interface Order {
  orderId: string
  market: MarketDisplay
  side: OrderSide
  type: OrderType
  price?: string
  originalSize: string
  remainingSize: string
  filledSize: string
  timeInForce?: TimeInForce
  expiresAt?: string
  reduceOnly?: boolean
  isTrigger?: boolean
  triggerPrice?: string
  triggerCondition?: TriggerCondition
  status: OrderStatus
  /** Human-readable reason for a terminal non-FILLED status; undefined when no actionable detail. */
  statusReason?: string
  averagePrice?: string
  createdAt: string
  updatedAt: string
}

/**
 * Parameters for placing a regular order on a market.
 *
 * @public
 */
export interface PlaceOrderParams {
  market: MarketRef
  side: OrderSide
  type?: Exclude<OrderType, OrderType.TWAP>
  size: string
  price?: string
  leverage?: number
  /** Omitted falls back to the provider's default (currently CROSS). */
  marginMode?: MarginMode
  reduceOnly?: boolean
  timeInForce?: TimeInForce
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/**
 * Parameters for placing a take-profit or stop-loss trigger order.
 *
 * @public
 */
export interface PlaceTriggerOrderParams {
  market: MarketRef
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

/**
 * Parameters for placing a TWAP order that executes over a fixed duration.
 *
 * The core fields are provider-independent. The extras are only meaningful
 * when the provider advertises them via its `ProviderAction.params`
 * descriptors: `randomize` (Hyperliquid), and `frequencySeconds` /
 * `minPrice` / `maxPrice` (Ondo). Providers ignore extras they do not
 * advertise.
 *
 * @public
 */
export interface PlaceTwapOrderParams {
  market: MarketRef
  side: OrderSide
  /** Total base-asset size executed across the TWAP's lifetime, as a decimal string. */
  size: string
  /** Total execution window in seconds. */
  durationSeconds: number
  reduceOnly?: boolean
  /** Hyperliquid: randomize sub-order timing within the execution window. */
  randomize?: boolean
  /** Ondo: interval between child orders in seconds. */
  frequencySeconds?: number
  /** Ondo: lowest acceptable child-order price, as a decimal string. */
  minPrice?: string
  /** Ondo: highest acceptable child-order price, as a decimal string. */
  maxPrice?: string
}

/**
 * Parameters for cancelling a running TWAP order.
 *
 * @public
 */
export interface CancelTwapOrderParams {
  market: MarketRef
  /**
   * Provider-native TWAP identifier as a string: HL's numeric twapId,
   * Ondo's `twap_`-prefixed id, or Lighter's order-index. Providers
   * stringify/parse their native form. Lighter's order-index is scoped per
   * market, so `market` disambiguates it; HL and Ondo ids are globally unique.
   */
  twapId: string
}

/**
 * Normalized running-TWAP read model returned by provider TWAP queries.
 * Quantities and prices are decimal strings.
 *
 * @public
 */
export interface TwapOrder {
  /** Provider-native TWAP identifier, stringified (see {@link CancelTwapOrderParams.twapId}). */
  twapId: string
  market: MarketDisplay
  side: OrderSide
  /** Total base-asset size the TWAP was placed for. */
  totalSize: string
  /** Base-asset size executed so far. */
  filledSize: string
  /** Volume-weighted average fill price; absent until the first child fill. */
  avgFillPrice?: string
  /** ISO-8601 timestamp at which the TWAP started executing. */
  startedAt: string
  /** Total execution window in seconds. */
  durationSeconds: number
  status: TwapOrderStatus
}

/**
 * Parameters for cancelling one or more venue orders.
 *
 * @public
 */
export interface CancelOrderParams {
  /** Venue order ids. Venues whose ids are scoped per market (e.g. Lighter's
   * `order_index`) also accept the composite `"<market_id>:<order_id>"`. */
  ids: string[]
  /** Market context for per-market order ids; the order's `market.id`. */
  assetId?: string
}

/**
 * Parameters for applying one or more modifications to existing orders.
 *
 * @public
 */
export interface ModifyOrderParams {
  modifications: ModifyOrderInput[]
}

/**
 * Parameters for changing leverage on a market.
 *
 * @public
 */
export interface UpdateLeverageParams {
  market: MarketRef
  leverage: number
  /** Omitted falls back to the provider's default (currently CROSS). */
  marginMode?: MarginMode
}

/**
 * Parameters for adding or removing margin from a market position.
 * `amount` is a decimal string in the venue's collateral units.
 *
 * @public
 */
export interface UpdatePositionMarginParams {
  market: MarketRef
  action: 'add' | 'remove'
  amount: string
}

/**
 * Parameters for enabling or disabling an asset as cross-margin collateral.
 *
 * @public
 */
export interface UpdateAssetCollateralParams {
  /** Provider-native spot asset id (matches `Asset.id`), keyed per asset — not per market. */
  assetId: string
  /** Whether this asset's balance counts toward the cross-margin collateral pool. */
  enabled: boolean
}

/**
 * Parameters for withdrawing a decimal-string amount to an EVM address.
 *
 * @public
 */
export interface WithdrawalParams {
  destination: Address
  amount: string
}

/**
 * Parameters for depositing a token from an EVM source chain.
 *
 * @public
 */
export interface DepositParams {
  /** Amount of the token to deposit (human-readable, e.g. "100.5"). */
  amount: string
  /** ERC-20 token address on the source chain. */
  tokenAddress: Address
  /** Chain ID of the source chain (e.g. 1 for Ethereum, 42161 for Arbitrum). */
  chainId: number
}

/**
 * Parameters for approving an account agent, including an optional TTL in
 * milliseconds.
 *
 * @public
 */
export interface ApproveAgentParams {
  agentAddress: string
  agentTtlMs?: number
}

/**
 * Parameters for deregistering an account agent.
 *
 * @public
 */
export interface RevokeAgentParams {
  address: Address
  /** The name the venue holds for the agent. HyperCore identifies a named API
   * wallet by name, not by address, so a revoke that omits the exact stored
   * name leaves the slot occupied. */
  name: string
}

/**
 * Parameters for selecting a provider account mode by its wire value.
 *
 * @public
 */
export interface AccountModeParams {
  mode: string
}

/**
 * Parameters for selecting a provider account tier by its wire value.
 *
 * @public
 */
export interface AccountTypeParams {
  tier: string
}

/**
 * Parameters for moving an asset between provider DEX accounts.
 *
 * @public
 */
export interface SendAssetParams {
  /** Canonical `Asset.id` of the asset being moved (for Hyperliquid spot
   * assets, the token index as a string) — never a display symbol. */
  collateral: string
  sourceDex: string
  destinationDex: string
  amount: string
}

/**
 * Parameters for cancelling all orders immediately or through a scheduled
 * cancellation instruction.
 *
 * @public
 */
export interface CancelAllOrdersParams {
  /** 0=immediate (cancel GTC), 1=scheduled, 2=abort scheduled */
  timeInForce: number
  /** Unix timestamp in milliseconds (required for scheduled cancels) */
  timestampMs?: number
}

/**
 * Parameters for registering a provider API key. The backend selects the key
 * slot, so a caller never names one.
 *
 * @public
 */
export interface RegisterApiKeyParams {
  /**
   * The SDK's currently-stored Lighter public key, if any. The backend
   * returns `[]` (already satisfied) only when this equals the on-chain pubkey
   * at the slot it selects; otherwise it stages a ChangePubKey blob so the
   * slot can be (re-)registered. Omit when the SDK has no local key.
   */
  knownPublicKey?: string
}

/**
 * Parameters for approving a Lighter read-only token and its scope/expiry.
 *
 * @public
 */
export interface ApproveReadOnlyTokenParams {
  accountIndex: number
  /** Absolute unix-seconds expiry. Lighter requires lifetime between 1 day and 10 years. */
  expirySeconds: number
  scope: 'single' | 'all'
}

/**
 * Mapping from each {@link ActionType} to its action-specific parameter shape.
 * `Record<string, never>` marks actions whose params object must be empty.
 *
 * @public
 */
export interface ActionParamsMap {
  [ActionType.APPROVE_AGENT]: ApproveAgentParams
  [ActionType.REVOKE_AGENT]: RevokeAgentParams
  [ActionType.APPROVE_BUILDER_FEE]: Record<string, never>
  [ActionType.APPROVE_INTEGRATOR]: Record<string, never>
  [ActionType.SET_REFERRAL]: Record<string, never>
  [ActionType.ACCOUNT_MODE]: AccountModeParams
  [ActionType.ACCOUNT_TYPE]: AccountTypeParams
  [ActionType.SEND_ASSET]: SendAssetParams
  [ActionType.WITHDRAWAL]: WithdrawalParams
  [ActionType.TRANSFER]: Record<string, never>
  [ActionType.PLACE_ORDER]: PlaceOrderParams
  [ActionType.PLACE_TRIGGER_ORDER]: PlaceTriggerOrderParams
  [ActionType.PLACE_TWAP_ORDER]: PlaceTwapOrderParams
  [ActionType.CANCEL_ORDER]: CancelOrderParams
  [ActionType.CANCEL_ALL_ORDERS]: CancelAllOrdersParams
  [ActionType.CANCEL_TWAP_ORDER]: CancelTwapOrderParams
  [ActionType.MODIFY_ORDER]: ModifyOrderParams
  [ActionType.UPDATE_LEVERAGE]: UpdateLeverageParams
  [ActionType.UPDATE_POSITION_MARGIN]: UpdatePositionMarginParams
  [ActionType.UPDATE_ASSET_COLLATERAL]: UpdateAssetCollateralParams
  [ActionType.REGISTER_API_KEY]: RegisterApiKeyParams
  [ActionType.APPROVE_READ_ONLY_TOKEN]: ApproveReadOnlyTokenParams
  [ActionType.SIWE_LOGIN]: Record<string, never>
  [ActionType.CREATE_DEPOSIT_ADDRESS]: Record<string, never>
  [ActionType.ACCEPT_PROVIDER_TERMS]: Record<string, never>
  [ActionType.DEPOSIT]: DepositParams
  [ActionType.META_ACCEPT_TERMS]: AcceptTermsParams
  [ActionType.META_ONBOARD]: OnboardParams
  [ActionType.META_CREATE_REFERRAL_CODE]: CreateReferralCodeParams
  [ActionType.SYNC_FEE_ATTRIBUTION]: Record<string, never>
}

/**
 * Discriminated request sent to create unsigned steps for one action.
 *
 * @public
 */
export type CreateActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    params: ActionParamsMap[K]
  }
}[ActionType]

/**
 * Response containing the unsigned steps created for an action request.
 *
 * @public
 */
export interface CreateActionResponse {
  actions: ActionStep[]
}

/**
 * Discriminated request sent to execute signed steps for one action.
 *
 * @public
 */
export type ExecuteActionRequest = {
  [K in ActionType]: {
    provider: string
    address: Address
    signerAddress?: Address
    action: K
    actions: SignedActionStep[]
  }
}[ActionType]

/**
 * Response containing per-action execution results.
 *
 * @public
 */
export interface ExecuteActionResponse {
  results: ActionResult[]
}
