import type { PerpsMarket } from '@lifi/perps-types'
import { PositionMarginAdjustment } from '@lifi/perps-types'
import Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'
import type { HlMaxMarketOrderNtls, HlUniverseItem } from '../types/index.js'
import { calculateMaintenanceMarginRate } from './liquidation.js'
import { coinAsset } from './marketDisplay.js'
import { getMaxPriceDecimals } from './orderFormatting.js'

/** Hyperliquid quotes every perp market in USDC. */
const QUOTE_SYMBOL = 'USDC'
const LIMIT_ORDER_VALUE_MULTIPLIER = 10

type MarketOrderLimits = Pick<
  PerpsMarket,
  'maxMarketOrderUsd' | 'maxLimitOrderUsd'
>

const mapMarketOrderLimits = (
  maxLeverage: number,
  tiers?: HlMaxMarketOrderNtls
): MarketOrderLimits => {
  const selected = tiers?.find(
    ([minMaxLeverage]) => minMaxLeverage <= maxLeverage
  )
  if (selected === undefined) {
    return {}
  }
  return {
    maxMarketOrderUsd: selected[1],
    maxLimitOrderUsd: new Big(selected[1])
      .times(LIMIT_ORDER_VALUE_MULTIPLIER)
      .toFixed(),
  }
}

/**
 * Map Hyperliquid universe metadata and optional `maxMarketOrderNtls` tiers to
 * a {@link PerpsMarket}. Missing tiers leave both order caps unset. Live stats
 * stay on {@link MarketContext}; callers supply the provider category id
 * because the coin string does not contain it.
 * @public
 */
export const mapMarket = (
  universe: HlUniverseItem,
  categoryId: string,
  maxMarketOrderNtls?: HlMaxMarketOrderNtls
): PerpsMarket => ({
  providerId: PROVIDER_KEY,
  id: universe.name,
  ...(universe.isDelisted === undefined
    ? {}
    : { isDelisted: universe.isDelisted }),
  categoryId,
  baseAsset: coinAsset(universe.name),
  quoteAsset: coinAsset(QUOTE_SYMBOL),
  szDecimals: universe.szDecimals,
  priceDecimals: getMaxPriceDecimals(universe.szDecimals),
  maxLeverage: universe.maxLeverage,
  ...mapMarketOrderLimits(universe.maxLeverage, maxMarketOrderNtls),
  onlyIsolated:
    universe.marginMode !== undefined || universe.onlyIsolated === true,
  // Deprecated `onlyIsolated` cannot distinguish strict-isolated from
  // no-cross, so the ambiguous legacy shape fails closed as add-only.
  positionMarginAdjustment:
    universe.marginMode === 'noCross' ||
    (universe.marginMode === undefined && universe.onlyIsolated !== true)
      ? PositionMarginAdjustment.ADD_AND_REMOVE
      : PositionMarginAdjustment.ADD_ONLY,
  maintenanceMarginRate: calculateMaintenanceMarginRate(universe.maxLeverage),
})
