import type { Asset, LighterProviderKey } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

/**
 * Create the SDK asset descriptor for a Lighter asset identifier and display
 * symbol. Lighter assets do not provide a package-level logo URI, so this
 * helper leaves that field empty.
 *
 * @param providerId - Instance the asset belongs to; defaults to mainnet.
 * @public
 */
export const lighterAsset = (
  id: string,
  displaySymbol: string,
  providerId: LighterProviderKey = LIGHTER_PROVIDER_KEY
): Asset => ({
  providerId,
  id,
  displaySymbol,
  logoURI: '',
})
