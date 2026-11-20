import { PerpsError } from '@lifi/perps-sdk'
import type { Asset, Provider } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import { EXTENDED_PROVIDER_KEY } from '../constants.js'

/**
 * The collateral asset that the backend publishes for Extended's category.
 * The backend owns the collateral identity, so venue rows never name it.
 *
 * @throws {PerpsError} `SDKError` when the provider metadata carries none.
 * @internal
 */
export const requireExtendedCollateralAsset = (
  providers: readonly Provider[]
): Asset => {
  const asset = providers
    .find((provider) => provider.key === EXTENDED_PROVIDER_KEY)
    ?.categories.find(
      (category) => category.id === EXTENDED_PROVIDER_KEY
    )?.quoteAsset
  if (asset === null || asset === undefined) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended provider metadata is missing its collateral asset'
    )
    error.tool = EXTENDED_PROVIDER_KEY
    throw error
  }
  return asset
}
