import type { Asset } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'

/** @public */
export const ondoAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: ONDO_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: '',
})
