import type { Asset } from '@lifi/perps-types'

/**
 * Which of a venue's two balance routes a withdrawal is drawn from. Lighter's
 * own vocabulary, carried in the signed tx as `AssetRouteType` (`perps` = 0,
 * `spot` = 1); an account's mode changes what the two balances mean, never
 * which route the tx names.
 *
 * @public
 */
export type WithdrawalRoute = 'perps' | 'spot'

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
}
