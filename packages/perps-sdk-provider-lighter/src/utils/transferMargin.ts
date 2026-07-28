import {
  type Position,
  type PositionMarginConstraints,
  positionSupportsMarginAdjustment,
} from '@lifi/perps-types'
import { toPositiveRequiredBig } from './decimal.js'

const AMOUNT_INCREMENT = '0.000001'

/**
 * Lighter's exact isolated-margin requirement. Lighter publishes no separate
 * notional floor, so the provider-normalized initial-margin requirement is
 * the retained amount.
 *
 * @see https://docs.lighter.xyz/trading/liquidations-and-llp-insurance-fund
 * @public
 */
export function positionMarginConstraints(
  position: Position
): PositionMarginConstraints | undefined {
  if (!positionSupportsMarginAdjustment(position)) {
    return undefined
  }
  return {
    minimumMarginRequirement: toPositiveRequiredBig(
      position.initialMarginRequirement,
      'initialMarginRequirement'
    ).toFixed(),
    amountIncrement: AMOUNT_INCREMENT,
  }
}
