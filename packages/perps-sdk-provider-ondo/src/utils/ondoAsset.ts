import type { Asset } from '@lifi/perps-types'
import { ONDO_PROVIDER_KEY } from '../constants.js'

// Ondo labels its collateral `USD` but settles it in USDC, and its own
// per-symbol icon CDN serves no `USD.svg` — so the collateral takes `USDC.svg`.
const USD_COLLATERAL_LOGO_URI =
  'https://cdn.ondoperps.xyz/symbol-icons/USDC.svg'

/** @public */
export const ondoAsset = (id: string, displaySymbol: string): Asset => ({
  providerId: ONDO_PROVIDER_KEY,
  id,
  displaySymbol,
  logoURI: id === 'USD' ? USD_COLLATERAL_LOGO_URI : '',
})
