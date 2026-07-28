import type { Asset } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

/**
 * Create the SDK asset descriptor for a Lighter asset identifier and display
 * symbol. Lighter assets do not provide a package-level logo URI, so this
 * helper leaves that field empty.
 *
 * @public
 */
export const lighterAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: '',
})
