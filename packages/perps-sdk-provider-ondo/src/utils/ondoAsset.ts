import type { Asset } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'

/**
 * Retained for public API compatibility. Account collateral uses the backend
 * provider category; do not add logo metadata here.
 *
 * @public
 */
export const ondoAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: ONDO_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: '',
})
