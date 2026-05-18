import type { MarginMode, OrderType } from './enums.js'
import {
  type ActionType,
  type OrderSide,
  type OrderStatus,
  type TimeInForce,
  type TriggerCondition,
} from './enums.js'
import type { Address, Hex, PerpsTypedData } from './typedData.js'
import type { AssetIdentity, AssetDisplay } from './asset.js'

// ---------------------------------------------------------------------------
// Action step types (create → sign → execute flow)
//
// Union by structural shape — the SDK knows which variant to expect based
// on the provider's `signingMethod` from the /providers response.
//
//   Eip712    – Hyperliquid and future EVM dexes (EIP-712 typed data + ECDSA sig)
//   WasmBlob  – Lighter and zk-rollup dexes (WASM signer → {txType, txInfo, txHash})
//   EvmTx     – plain EVM transaction (reserved for future use)
// ---------------------------------------------------------------------------

export interface Eip712ActionStep {
  action: ActionType
  typedData: PerpsTypedData
}

export interface WasmBlobActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
}

export interface EvmTxActionStep {
  action: ActionType
  txParams: Record<string, unknown>
}

export type ActionStep = Eip712ActionStep | WasmBlobActionStep | EvmTxActionStep

export interface Eip712SignedActionStep {
  action: ActionType
  typedData: PerpsTypedData
  signature: Hex
}

export interface WasmBlobSignedActionStep {
  action: ActionType
  wasmSignParams: Record<string, unknown>
  signedTx: {
    txType: number
    txInfo: string
    txHash: string
  }
}

export interface EvmTxSignedActionStep {
  action: ActionType
  txParams: Record<string, unknown>
  txHash: string
}

export type SignedActionStep =
  | Eip712SignedActionStep
  | WasmBlobSignedActionStep
  | EvmTxSignedActionStep

export interface ActionResult {
  action: ActionType
  success: boolean
  orderId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Shared data types
// ---------------------------------------------------------------------------

export interface TriggerOrderInput {
  triggerPrice: string
  limitPrice?: string
}

export interface ModifyOrderInput {
  id: string
  price?: string
  size?: string
  triggerPrice?: string
  limitPrice?: string
}

export interface Order {
  orderId: string
  asset: AssetDisplay
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
  averagePrice?: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Per-action param types
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  asset: AssetIdentity
  side: OrderSide
  type?: OrderType
  size: string
  price?: string
  leverage?: number
  /**
   * Margin mode to use for the position. When omitted, the backend falls back
   * to the provider's default (currently CROSS for both Hyperliquid and
   * Lighter). Callers should set this explicitly when they need ISOLATED.
   */
  marginMode?: MarginMode
  reduceOnly?: boolean
  timeInForce?: TimeInForce
  expiresAt?: string
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

export interface PlaceTriggerOrderParams {
  asset: AssetIdentity
  side: OrderSide
  takeProfit?: TriggerOrderInput
  stopLoss?: TriggerOrderInput
}

export interface CancelOrderParams {
  ids: string[]
}

export interface ModifyOrderParams {
  modifications: ModifyOrderInput[]
}

export interface UpdateLeverageParams {
  asset: AssetIdentity
  leverage: number
  /**
   * Margin mode to use for the position. When omitted, the backend falls back
   * to the provider's default (currently CROSS for both Hyperliquid and
   * Lighter). Callers should set this explicitly when they need ISOLATED.
   */
  marginMode?: MarginMode
}

export interface UpdatePositionMarginParams {
  asset: AssetIdentity
  action: 'add' | 'remove'
  amount: string
}

export interface WithdrawalParams {
  destination: Address
  amount: string
}

export interface DepositParams {
  /** Amount of the token to deposit (human-readable, e.g. "100.5"). */
  amount: string
  /** ERC-20 token address on the source chain. */
  tokenAddress: Address
  /** Chain ID of the source chain (e.g. 1 for Ethereum, 42161 for Arbitrum). */
  chainId: number
}

export interface ApproveAgentParams {
  agentAddress: string
  agentTtlMs?: number
}

/**
 * Params for `ActionType.ACCOUNT_MODE` — switch the account's operating
 * mode (e.g. HL abstraction variant, Lighter UTA / Simple). The string
 * is opaque per-provider; the authoritative enumeration of valid values
 * lives on the descriptor's `Param.values` array (see
 * `ProviderActionDescriptor` in `providers.ts`). The SDK and backend are
 * responsible for validating `mode` against that array — `@lifi/perps-types`
 * intentionally does not encode the per-provider value list here, so a
 * provider can add a new mode without a types release.
 */
export interface AccountModeParams {
  mode: string
}

/**
 * Params for `ActionType.ACCOUNT_TYPE` — switch the account's fee/latency
 * tier (e.g. Lighter standard / premium). Providers without tiering omit
 * the action entirely; the descriptor's `Param.values` array enumerates
 * the valid tiers for providers that do support it.
 */
export interface AccountTypeParams {
  tier: string
}

export interface SendAssetParams {
  collateral: string
  sourceDex: string
  destinationDex: string
  amount: string
}

// ---------------------------------------------------------------------------
// ActionParamsMap — compile-time type resolution for SDK
// ---------------------------------------------------------------------------

export interface CancelAllOrdersParams {
  /** 0=immediate (cancel GTC), 1=scheduled, 2=abort scheduled */
  timeInForce: number
  /** Unix timestamp in milliseconds (required for scheduled cancels) */
  timestampMs?: number
}

export interface RegisterApiKeyParams {
  /** The API key slot index to register (0-255). Reusing a fixed slot overwrites the old key. */
  apiKeyIndex: number
}

export interface ActionParamsMap {
  [ActionType.APPROVE_AGENT]: ApproveAgentParams
  [ActionType.APPROVE_BUILDER_FEE]: Record<string, never>
  [ActionType.ACCOUNT_MODE]: AccountModeParams
  [ActionType.ACCOUNT_TYPE]: AccountTypeParams
  [ActionType.SEND_ASSET]: SendAssetParams
  [ActionType.WITHDRAWAL]: WithdrawalParams
  [ActionType.TRANSFER]: Record<string, never>
  [ActionType.PLACE_ORDER]: PlaceOrderParams
  [ActionType.PLACE_TRIGGER_ORDER]: PlaceTriggerOrderParams
  [ActionType.CANCEL_ORDER]: CancelOrderParams
  [ActionType.CANCEL_ALL_ORDERS]: CancelAllOrdersParams
  [ActionType.MODIFY_ORDER]: ModifyOrderParams
  [ActionType.UPDATE_LEVERAGE]: UpdateLeverageParams
  [ActionType.UPDATE_POSITION_MARGIN]: UpdatePositionMarginParams
  [ActionType.REGISTER_API_KEY]: RegisterApiKeyParams
  [ActionType.DEPOSIT]: DepositParams
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface CreateActionRequest {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  params: ActionParamsMap[ActionType]
}

export interface CreateActionResponse {
  actions: ActionStep[]
}

export interface ExecuteActionRequest {
  provider: string
  address: Address
  signerAddress?: Address
  action: ActionType
  actions: SignedActionStep[]
}

export interface ExecuteActionResponse {
  results: ActionResult[]
}
