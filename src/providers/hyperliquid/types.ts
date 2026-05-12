import type { Address } from 'viem'

// ---------------------------------------------------------------------------
// Hyperliquid /info response types
// ---------------------------------------------------------------------------

// -- metaAndAssetCtxs -------------------------------------------------------

export type HlUniverseItem = {
  name: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated?: boolean
  isDelisted?: boolean
}

export type HlMeta = {
  universe: HlUniverseItem[]
}

export type HlAssetCtx = {
  funding: string
  openInterest: string
  dayNtlVlm: string
  prevDayPx: string
  markPx: string
}

export type HlMetaAndAssetCtxs = [HlMeta, HlAssetCtx[]]

export type HlUniverse = HlMeta['universe']

// -- allMids ----------------------------------------------------------------

export type HlAllMids = Record<string, string>

// -- candleSnapshot ---------------------------------------------------------

export type HlCandle = {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export type HlCandleSnapshot = HlCandle[]

// -- l2Book -----------------------------------------------------------------

export type HlLevel = {
  px: string
  sz: string
  n: number
}

export type HlL2Book = {
  levels: [HlLevel[], HlLevel[]]
  time: number
}

// -- clearinghouseState -----------------------------------------------------

export type HlPosition = {
  coin: string
  szi: string
  entryPx: string
  positionValue: string
  liquidationPx: string
  unrealizedPnl: string
  marginUsed: string
  leverage: {
    type: string
    value: number
  }
}

export type HlAssetPosition = {
  position: HlPosition
}

export type HlClearinghouseState = {
  assetPositions: HlAssetPosition[]
  marginSummary: {
    accountValue: string
    totalMarginUsed: string
  }
  crossMarginSummary: {
    accountValue: string
    totalMarginUsed: string
  }
}

// -- spotClearinghouseState -------------------------------------------------

export type HlSpotBalance = {
  coin: string
  token: number
  total: string
  hold: string
  entryNtl: string
}

export type HlSpotClearinghouseState = {
  balances: HlSpotBalance[]
}

// -- userFees ---------------------------------------------------------------

export type HlUserFees = {
  userAddRate: string
  userCrossRate: string
  activeReferralDiscount: string
}

// -- frontendOpenOrders -----------------------------------------------------

export type HlFrontendOpenOrder = {
  oid: number
  coin: string
  side: string
  sz: string
  limitPx: string
  orderType: string
  origSz: string
  reduceOnly: boolean
  timestamp: number
  isTrigger: boolean
  isPositionTpsl: boolean
  triggerCondition: string
  triggerPx: string
  children: HlFrontendOpenOrder[]
  tif: string | null
  cloid: string | null
}

export type HlFrontendOpenOrders = HlFrontendOpenOrder[]

// -- extraAgents ------------------------------------------------------------

export type HlExtraAgents = Record<string, unknown>[]

// -- userFills / userFillsByTime --------------------------------------------

export type HlUserFill = {
  tid: number
  oid: number
  coin: string
  side: string
  sz: string
  px: string
  dir: string
  fee: string
  closedPnl: string
  crossed: boolean
  time: number
  startPosition: string
}

export type HlUserFills = HlUserFill[]

export type HlUserFillsByTime = HlUserFill[]

// -- orderStatus ------------------------------------------------------------

export type HlOrderDetail = {
  order: {
    oid: number
    coin: string
    side: string
    sz: string
    limitPx: string
    orderType: string
    origSz: string
    reduceOnly: boolean
    timestamp: number
    tif: string | null
    cloid: string | null
    triggerCondition: string
    triggerPx: string | null
  }
  status: string
  statusTimestamp: number
}

export type HlOrderStatusFound = {
  status: 'order'
  order: HlOrderDetail
}

export type HlOrderStatusResponse =
  | HlOrderStatusFound
  | { status: 'unknownOid' }

// -- userNonFundingLedgerUpdates --------------------------------------------

/**
 * Hyperliquid `spotTransfer` ledger delta. Emitted for transfers of spot
 * tokens between Hyperliquid accounts. `user` is the sender, `destination`
 * the recipient; direction is derived at the call site from the queried
 * address.
 */
export type HlSpotTransferDelta = {
  type: 'spotTransfer'
  token: string
  amount: string
  usdcValue: string
  user: Address
  destination: Address
  fee?: string
  nativeTokenFee?: string
  nonce?: number
}

/**
 * Hyperliquid ledger delta emitted for the `sendAsset` exchange action.
 *
 * Note the delta `type` literal is `'send'` (NOT `'sendAsset'`) — that's the
 * shape Hyperliquid emits from `userNonFundingLedgerUpdates` for sendAsset
 * action outcomes. The perps-types name retains the `SendAsset` prefix
 * because it's the human-meaningful name aligned with the exchange action
 * and matches `HL_PRIMARY_TYPE_SEND_ASSET`.
 *
 * Field shape verified against the official @nktkas/hyperliquid SDK
 * `userNonFundingLedgerUpdates` response schema (the upstream Hyperliquid
 * info-API docs do not enumerate every delta variant — nktkas's SDK is the
 * de-facto reference for these shapes).
 *
 * Semantics:
 * - `user` is the initiator (sender) address.
 * - `destination` is the recipient address. For same-user dex moves
 *   (e.g. moving USDC from perp to spot on one's own account) `user`
 *   and `destination` will both equal the queried address.
 * - `sourceDex` / `destinationDex` use `""` for the main USDC perp DEX,
 *   `"spot"` for spot, or the perp DEX name otherwise.
 * - `token` is a wire token identifier (e.g. `"USDC"` or `"TOKEN:0x..."`).
 * - `nonce` is the wire nonce (ms timestamp). Per upstream schema this is
 *   always present on `send` deltas (unlike `spotTransfer` where it may be
 *   null).
 */
export type HlSendAssetDelta = {
  type: 'send'
  user: Address
  destination: Address
  sourceDex: string
  destinationDex: string
  token: string
  amount: string
  usdcValue: string
  fee: string
  nativeTokenFee: string
  nonce: number
  feeToken: string
}

export type HlLedgerDelta =
  | HlSpotTransferDelta
  | HlSendAssetDelta
  | {
      type: string
      usdc?: string
      [key: string]: unknown
    }

/**
 * Type guard for `HlSpotTransferDelta` — TypeScript cannot narrow off the
 * `type` discriminant alone because the catch-all arm of `HlLedgerDelta` has
 * `type: string` (a supertype of the literal `'spotTransfer'`). Use this at
 * call sites that need the strongly-typed shape.
 */
export const isSpotTransferDelta = (
  delta: HlLedgerDelta
): delta is HlSpotTransferDelta => delta.type === 'spotTransfer'

/**
 * Type guard for `HlSendAssetDelta`. The ledger delta `type` literal is
 * `'send'` (Hyperliquid's wire-level name for sendAsset action outcomes);
 * see the `HlSendAssetDelta` JSDoc for the naming-vs-wire-format rationale.
 * Same catch-all-arm caveat applies as for `isSpotTransferDelta`.
 */
export const isSendAssetDelta = (
  delta: HlLedgerDelta
): delta is HlSendAssetDelta => delta.type === 'send'

export type HlLedgerUpdate = {
  time: number
  hash: string
  delta: HlLedgerDelta
}

export type HlUserNonFundingLedgerUpdates = HlLedgerUpdate[]

// -- userFunding ------------------------------------------------------------

export type HlFundingDelta = {
  type: 'funding'
  coin: string
  usdc: string
  szi: string
  fundingRate: string
}

export type HlFundingUpdate = {
  time: number
  hash: string
  delta: HlFundingDelta
}

export type HlUserFunding = HlFundingUpdate[]

// -- abstraction mode -------------------------------------------------------

/**
 * Possible values returned by the `userAbstraction` info endpoint.
 * `null` means abstraction has never been set (standard mode).
 */
export const HlAbstractionMode = {
  DISABLED: 'disabled',
  UNIFIED_ACCOUNT: 'unifiedAccount',
  PORTFOLIO_MARGIN: 'portfolioMargin',
  DEX_ABSTRACTION: 'dexAbstraction',
} as const

export type HlAbstractionMode =
  (typeof HlAbstractionMode)[keyof typeof HlAbstractionMode]

// -- perpDexs ---------------------------------------------------------------

export type HlPerpDexs = (null | { name: string })[]

// ---------------------------------------------------------------------------
// Exchange request / response types
// ---------------------------------------------------------------------------

export type HlExchangeRequest = {
  action: Record<string, unknown>
  signature: {
    r: string
    s: string
    v: number
  }
  nonce: number
  vaultAddress?: string | null
}

export type HlExchangeResponse = {
  status: string
  response?:
    | string
    | {
        type: string
        data?: {
          statuses?: (
            | string
            | { filled: { totalSz: string; avgPx: string; oid: number } }
            | { resting: { oid: number } }
            | { waitingForFill: { oid: number } }
            | { waitingForTrigger: { oid: number } }
            | { success: true }
            | { error: string }
          )[]
          status?: unknown
        }
      }
}

// ---------------------------------------------------------------------------
// Hyperliquid EIP-712 primary type constants
// ---------------------------------------------------------------------------

export const HL_PRIMARY_TYPE_APPROVE_AGENT =
  'HyperliquidTransaction:ApproveAgent' as const
export const HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE =
  'HyperliquidTransaction:ApproveBuilderFee' as const
export const HL_PRIMARY_TYPE_USER_SET_ABSTRACTION =
  'HyperliquidTransaction:UserSetAbstraction' as const
export const HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION =
  'HyperliquidTransaction:AgentSetAbstraction' as const
export const HL_PRIMARY_TYPE_WITHDRAW =
  'HyperliquidTransaction:Withdraw' as const
export const HL_PRIMARY_TYPE_SEND_ASSET =
  'HyperliquidTransaction:SendAsset' as const
export const HL_PRIMARY_TYPE_AGENT = 'Agent' as const

export type HlPrimaryType =
  | typeof HL_PRIMARY_TYPE_APPROVE_AGENT
  | typeof HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE
  | typeof HL_PRIMARY_TYPE_USER_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_WITHDRAW
  | typeof HL_PRIMARY_TYPE_SEND_ASSET
  | typeof HL_PRIMARY_TYPE_AGENT
