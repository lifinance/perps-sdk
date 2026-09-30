import type { ActionType, Asset, WithdrawalRoute } from '@lifi/perps-types'
import type { Address } from 'viem'

export type { WithdrawalRoute }

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
   * Absent when the venue publishes no fee for the asset. The client rejects a
   * value that is not a non-negative decimal.
   */
  withdrawalFee?: string
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
   * Flat venue fee on a withdrawal from this row, in the asset's own units. An
   * amount at or below it delivers nothing. Absent when the venue publishes no
   * fee for the asset.
   */
  withdrawalFee?: string
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
