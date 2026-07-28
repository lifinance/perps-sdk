// Hyperliquid `/exchange` request/response shapes + EIP-712 primary types.

/**
 * EIP-712 `/exchange` request sent to Hyperliquid.
 *
 * `action` is the provider-specific action object; signature fields are the
 * hex `r`/`s` values and recovery byte `v`; `nonce` is milliseconds since the
 * Unix epoch. `vaultAddress` is included only when submitting for a vault.
 * @public
 */
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

/**
 * Response envelope returned by Hyperliquid `/exchange`.
 *
 * A successful response may contain per-order statuses such as `filled`,
 * `resting`, or `error`; the provider keeps the upstream status strings and
 * numeric order IDs unchanged.
 * @public
 */
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

/** EIP-712 primary type for user approval of a Hyperliquid agent wallet. @public */
export const HL_PRIMARY_TYPE_APPROVE_AGENT =
  'HyperliquidTransaction:ApproveAgent' as const
/** EIP-712 primary type for user approval of an integrator builder fee. @public */
export const HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE =
  'HyperliquidTransaction:ApproveBuilderFee' as const
/** EIP-712 primary type for changing the user's account abstraction mode. @public */
export const HL_PRIMARY_TYPE_USER_SET_ABSTRACTION =
  'HyperliquidTransaction:UserSetAbstraction' as const
/** EIP-712 primary type for an agent wallet changing abstraction mode. @public */
export const HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION =
  'HyperliquidTransaction:AgentSetAbstraction' as const
/** EIP-712 primary type for withdrawing assets from Hyperliquid. @public */
export const HL_PRIMARY_TYPE_WITHDRAW =
  'HyperliquidTransaction:Withdraw' as const
/** EIP-712 primary type for sending assets between Hyperliquid accounts or DEXes. @public */
export const HL_PRIMARY_TYPE_SEND_ASSET =
  'HyperliquidTransaction:SendAsset' as const
/** EIP-712 primary type used by the agent wallet authorization payload. @public */
export const HL_PRIMARY_TYPE_AGENT = 'Agent' as const

/**
 * Union of EIP-712 primary type names supported by Hyperliquid signing actions.
 * Values are the exact strings required in the typed-data domain.
 * @public
 */
export type HlPrimaryType =
  | typeof HL_PRIMARY_TYPE_APPROVE_AGENT
  | typeof HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE
  | typeof HL_PRIMARY_TYPE_USER_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION
  | typeof HL_PRIMARY_TYPE_WITHDRAW
  | typeof HL_PRIMARY_TYPE_SEND_ASSET
  | typeof HL_PRIMARY_TYPE_AGENT
