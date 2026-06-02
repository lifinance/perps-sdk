import type { Address } from 'viem'

// `userNonFundingLedgerUpdates` + `userFunding` shapes.

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
 * Hyperliquid ledger delta emitted for the `sendAsset` exchange action. The
 * wire `type` literal is `'send'` (NOT `'sendAsset'`); the TS name retains
 * the `SendAsset` prefix to match `HL_PRIMARY_TYPE_SEND_ASSET`.
 *
 * - `user` is the sender, `destination` the recipient. For same-user dex
 *   moves both equal the queried address.
 * - `sourceDex` / `destinationDex` use `""` for the main USDC perp DEX,
 *   `"spot"` for spot, or the perp DEX name otherwise.
 * - `token` is a wire token identifier (e.g. `"USDC"` or `"TOKEN:0x..."`).
 * - `nonce` is the wire nonce (ms timestamp); always present on `send`
 *   deltas, unlike `spotTransfer` where it may be null.
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
 * Type guard for `HlSendAssetDelta`. The wire `type` literal is `'send'`;
 * see `HlSendAssetDelta` for the naming-vs-wire-format rationale. Same
 * catch-all-arm caveat as `isSpotTransferDelta`.
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
