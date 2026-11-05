import type { HlUserFill } from '../types/index.js'

/**
 * Whether the fill liquidates `address`. Hyperliquid attaches `liquidation` to
 * the fills of both parties, so only a fill whose `liquidatedUser` is the
 * address counts. The address compare ignores case.
 */
export const isFillLiquidatingAccount = (
  fill: Pick<HlUserFill, 'liquidation'>,
  address: string
): boolean =>
  fill.liquidation?.liquidatedUser.toLowerCase() === address.toLowerCase()
