import type { Position } from '@lifi/perps-types'

/**
 * Ondo uses cross margin exclusively, so it exposes no individual position
 * margin adjustment.
 *
 * @see https://docs.ondo.finance/ondo-global-markets/perpetuals/trading/margin
 * @public
 */
export function positionMarginConstraints(_position: Position): undefined {
  return undefined
}
