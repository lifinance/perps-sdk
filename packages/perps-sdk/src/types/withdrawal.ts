import type { ActionType, Asset, WithdrawalRoute } from '@lifi/perps-types'
import type { Address } from 'viem'

export type { WithdrawalRoute }

/**
 * How a venue applies a row's `withdrawalFee` to the requested amount:
 * `'deducted'` takes it out of the amount, `'onTop'` charges it in addition.
 *
 * @public
 */
export type WithdrawalFeeMode = 'deducted' | 'onTop'

/**
 * One withdrawable `(asset, route)` selection as the provider reports it, keyed
 * by provider-native asset id and awaiting the core asset-metadata join.
 *
 * @public
 */
export interface ProviderWithdrawableBalance {
  /** Provider-native `Asset.id`; never a display symbol. */
  assetId: string
  route: WithdrawalRoute
  /** Withdrawable amount in the asset's own units. Always greater than zero. */
  available: string
  /**
   * Flat venue fee on a withdrawal from this row, in the asset's own units.
   * `withdrawalFeeMode` says whether the venue deducts it from the requested
   * amount or adds it on top. Absent when the venue publishes no fee for the
   * asset. The client rejects a value that is not a non-negative decimal.
   */
  withdrawalFee?: string
  /** Set together with `withdrawalFee`. */
  withdrawalFeeMode?: WithdrawalFeeMode
}

/**
 * One withdrawable `(asset, route)` selection a caller can act on: the amount
 * clears the asset's venue minimum, and `asset` carries the precision and
 * minimum needed to scale and validate the withdrawal.
 *
 * @public
 */
export interface WithdrawableBalance {
  asset: Asset
  route: WithdrawalRoute
  /** Withdrawable amount in the asset's own units. */
  available: string
  /**
   * Flat venue fee on a withdrawal from this row, in the asset's own units.
   * Absent when the venue publishes no fee for the asset. With
   * `withdrawalFeeMode` `'deducted'`, the venue takes the fee out of the
   * requested amount, and an amount at or below the fee delivers nothing. With
   * `'onTop'`, the venue charges the fee in addition to the requested amount,
   * so the largest amount the row can fund is `available` minus the fee.
   */
  withdrawalFee?: string
  /**
   * Set together with `withdrawalFee`. Absent on a row from a provider plugin
   * that does not report it.
   */
  withdrawalFeeMode?: WithdrawalFeeMode
}

/**
 * The venue accepts a withdrawal to `destination` now.
 *
 * @public
 */
export interface WithdrawFlowReady {
  kind: 'ready'
  destination: Address
}

/**
 * The venue cannot accept a withdrawal until the listed setup actions are
 * satisfied — Ondo sends funds only to an address in its address book, behind
 * a signed-in session.
 *
 * @public
 */
export interface WithdrawFlowSetupRequired {
  kind: 'setupRequired'
  /** Setup action types that must be completed, in execution order. */
  setup: ActionType[]
}

/**
 * The single withdrawal flow a venue offers one address, resolved from the
 * venue's account and setup state.
 *
 * @public
 */
export type WithdrawFlow = WithdrawFlowReady | WithdrawFlowSetupRequired
