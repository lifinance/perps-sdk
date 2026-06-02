// Hyperliquid `/exchange` request/response shapes + EIP-712 primary types.

/** @public */
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

/** @public */
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

/** @public */
export const HL_PRIMARY_TYPE_APPROVE_AGENT =
  'HyperliquidTransaction:ApproveAgent' as const
/** @public */
export const HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE =
  'HyperliquidTransaction:ApproveBuilderFee' as const
/** @public */
export const HL_PRIMARY_TYPE_USER_SET_ABSTRACTION =
  'HyperliquidTransaction:UserSetAbstraction' as const
/** @public */
export const HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION =
  'HyperliquidTransaction:AgentSetAbstraction' as const
/** @public */
export const HL_PRIMARY_TYPE_WITHDRAW =
  'HyperliquidTransaction:Withdraw' as const
/** @public */
export const HL_PRIMARY_TYPE_SEND_ASSET =
  'HyperliquidTransaction:SendAsset' as const
/** @public */
export const HL_PRIMARY_TYPE_AGENT = 'Agent' as const

/** @public */
export type HlPrimaryType =
  | typeof HL_PRIMARY_TYPE_APPROVE_AGENT
  | typeof HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE
  | typeof HL_PRIMARY_TYPE_USER_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_WITHDRAW
  | typeof HL_PRIMARY_TYPE_SEND_ASSET
  | typeof HL_PRIMARY_TYPE_AGENT
