import type { ProviderWithdrawableBalance } from '@lifi/perps-sdk'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlSpotClearinghouseState,
} from '../types/index.js'
import { isUnifiedAbstraction } from './abstractionMode.js'
import { assetIsOutcome } from './assetId.js'
import { toWireBig } from './decimal.js'

/**
 * Split a Hyperliquid account's venue figures into the routes a withdrawal
 * draws on. A unified or portfolio-margin account holds its collateral in spot,
 * so each spot token adds the part of `total` that no order or margin holds. A
 * route with nothing left to draw carries no row, and the caller applies the
 * per-asset venue minimum.
 *
 * @param quoteAssetId - `Asset.id` the perps-route row is keyed by.
 * @public
 */
export const hyperliquidWithdrawableBalances = (
  abstraction: HlAbstractionMode | null,
  state: HlClearinghouseState,
  spotState: HlSpotClearinghouseState,
  quoteAssetId: string
): ProviderWithdrawableBalance[] => {
  const rows: ProviderWithdrawableBalance[] = []

  if (isUnifiedAbstraction(abstraction)) {
    for (const balance of spotState.balances) {
      if (assetIsOutcome(balance.coin)) {
        continue
      }
      const spot = toWireBig(balance.total, 'spotBalance.total').minus(
        toWireBig(balance.hold, 'spotBalance.hold')
      )
      if (spot.gt(0)) {
        rows.push({
          assetId: String(balance.token),
          route: 'spot',
          available: spot.toFixed(),
        })
      }
    }
  }

  const perps = toWireBig(state.withdrawable, 'clearinghouseState.withdrawable')
  if (perps.gt(0)) {
    rows.push({
      assetId: quoteAssetId,
      route: 'perps',
      available: perps.toFixed(),
    })
  }

  return rows
}
