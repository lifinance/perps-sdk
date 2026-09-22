import { PerpsError } from '@lifi/perps-sdk'
import type { Asset, Provider } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'

/**
 * The collateral asset the backend publishes for Ondo's single category. The
 * backend owns the collateral identity, so the venue payload never names it.
 *
 * @throws {PerpsError} `SDKError` when the provider metadata carries none.
 * @public
 */
export const requireOndoCollateralAsset = (
  providers: readonly Provider[]
): Asset => {
  const asset = providers
    .find((provider) => provider.key === ONDO_PROVIDER_KEY)
    ?.categories.find(
      (category) => category.id === ONDO_PROVIDER_KEY
    )?.quoteAsset
  if (asset === null || asset === undefined) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      'Ondo provider metadata is missing its collateral asset'
    )
    error.tool = ONDO_PROVIDER_KEY
    throw error
  }
  return asset
}
