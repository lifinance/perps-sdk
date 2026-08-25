import type { Address } from 'viem'

// `userNonFundingLedgerUpdates` + `userFunding` shapes.

/**
 * Hyperliquid `spotTransfer` ledger delta. Emitted for transfers of spot
 * tokens between Hyperliquid accounts. `user` is the sender, `destination`
 * the recipient; direction is derived at the call site from the queried
 * address.
 * @public
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
 * @public
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

/**
 * Hyperliquid `deposit` ledger delta. Perp-collateral deposits are always
 * USDC-denominated, which is why the amount arrives in a field named `usdc`.
 * @public
 */
export type HlDepositDelta = {
  type: 'deposit'
  usdc: string
}

/**
 * Hyperliquid `withdraw` ledger delta. `fee` is denominated in the withdrawn
 * asset (USDC) and is absent when the venue charges none.
 * @public
 */
export type HlWithdrawDelta = {
  type: 'withdraw'
  usdc: string
  fee?: string
}

/**
 * One position closed by a Hyperliquid liquidation. `coin` is the venue market
 * key and `szi` the signed position size.
 * @public
 */
export type HlLiquidatedPosition = {
  coin: string
  szi: string
}

/**
 * Hyperliquid `liquidation` ledger delta. A cross-margin cascade reports every
 * closed position in `liquidatedPositions`, so the venue itself carries the
 * grouping and no timestamp heuristic is needed.
 * @public
 */
export type HlLiquidationDelta = {
  type: 'liquidation'
  liquidatedNtlPos?: string
  accountValue?: string
  leverageType: string
  liquidatedPositions?: HlLiquidatedPosition[]
}

/**
 * Union of known Hyperliquid non-funding ledger deltas plus an open fallback
 * for endpoint variants the provider does not map.
 * @public
 */
export type HlLedgerDelta =
  | HlSpotTransferDelta
  | HlSendAssetDelta
  | HlDepositDelta
  | HlWithdrawDelta
  | HlLiquidationDelta
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
 * @public
 */
export const isSpotTransferDelta = (
  delta: HlLedgerDelta
): delta is HlSpotTransferDelta => delta.type === 'spotTransfer'

/**
 * Type guard for `HlSendAssetDelta`. The wire `type` literal is `'send'`;
 * see `HlSendAssetDelta` for the naming-vs-wire-format rationale. Same
 * catch-all-arm caveat as `isSpotTransferDelta`.
 * @public
 */
export const isSendAssetDelta = (
  delta: HlLedgerDelta
): delta is HlSendAssetDelta => delta.type === 'send'

// `usdc` is declared only on the union's catch-all arm, so reading it off the
// union needs a widening read before the discriminant has narrowed the type.
const hasUsdcAmount = (delta: HlLedgerDelta): boolean =>
  typeof (delta as { usdc?: unknown }).usdc === 'string'

/**
 * Type guard for `HlDepositDelta`. The amount is part of the guard: a deposit
 * row without one identifies no movement, and reporting it as a zero amount
 * would read as a real zero-value deposit.
 * @public
 */
export const isDepositDelta = (delta: HlLedgerDelta): delta is HlDepositDelta =>
  delta.type === 'deposit' && hasUsdcAmount(delta)

/**
 * Type guard for `HlWithdrawDelta`. Same amount-bearing requirement as
 * `isDepositDelta`.
 * @public
 */
export const isWithdrawDelta = (
  delta: HlLedgerDelta
): delta is HlWithdrawDelta => delta.type === 'withdraw' && hasUsdcAmount(delta)

/**
 * Type guard for `HlLiquidationDelta`. Same catch-all-arm caveat as
 * `isSpotTransferDelta`.
 * @public
 */
export const isLiquidationDelta = (
  delta: HlLedgerDelta
): delta is HlLiquidationDelta => delta.type === 'liquidation'

/**
 * One timestamped non-funding ledger update. `time` is milliseconds since
 * epoch and `hash` is the upstream transaction identifier.
 * @public
 */
export type HlLedgerUpdate = {
  time: number
  hash: string
  delta: HlLedgerDelta
}

/** Array returned by `userNonFundingLedgerUpdates`. @public */
export type HlUserNonFundingLedgerUpdates = HlLedgerUpdate[]

/**
 * Funding ledger delta returned by Hyperliquid `userFunding`. `usdc` is the
 * funding payment, `szi` is signed position size, and `fundingRate` is a
 * decimal fraction; all are decimal strings.
 * @public
 */
export type HlFundingDelta = {
  type: 'funding'
  coin: string
  /**
   * Signed, in USDC. Positive means the account received funding; negative
   * means the account paid it. Mapped straight onto `FundingActivity.amount`.
   */
  usdc: string
  szi: string
  fundingRate: string
}

/**
 * Timestamped funding update. `time` is milliseconds since epoch; `hash` is
 * always the zero hash — funding is a system ledger event with no venue
 * transaction behind it.
 * @public
 */
export type HlFundingUpdate = {
  time: number
  hash: string
  delta: HlFundingDelta
}

/** Array returned by the `userFunding` info query. @public */
export type HlUserFunding = HlFundingUpdate[]
