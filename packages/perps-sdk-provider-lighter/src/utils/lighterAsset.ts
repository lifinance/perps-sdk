import type { Asset } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY } from '../constants.js'

/** @public */
export const lighterAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: LIGHTER_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: '',
})
