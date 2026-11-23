import {
  addDecimalString,
  buildCrossMarginHealth,
  compareDecimalStrings,
  isDecimalString,
  subtractDecimalString,
} from '@lifi/perps-sdk'
import {
  AccountMode,
  type Asset,
  type CrossMarginHealth,
  CrossMarginHealthStatus,
  type DecimalString,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlSpotClearinghouseState,
} from '../types/account.js'

// Cross positions liquidate when account value falls below maintenance margin
// (hyperliquid-docs/trading/margining#maintenance-margin-and-liquidations).
const CROSS_LIQUIDATION_THRESHOLD = '1'
// Liquidatable when portfolio_margin_ratio > 0.95
// (hyperliquid-docs/trading/portfolio-margin#liquidations).
const PORTFOLIO_MARGIN_LIQUIDATION_THRESHOLD = '0.95'

/** Add a venue term to a token's sum. A malformed term makes the sum `undefined`. */
const addTokenTerm = (
  sums: Map<string, DecimalString | undefined>,
  token: string,
  term: string
): void => {
  const sum = sums.has(token) ? sums.get(token) : '0'
  sums.set(
    token,
    sum === undefined || !isDecimalString(term)
      ? undefined
      : addDecimalString(sum, term)
  )
}

/**
 * The ratio of each collateral token, in the operation order of
 * `computeUnifiedAccountRatio` in hyperliquid-docs
 * trading/account-abstraction-modes#unified-account-ratio.
 */
const buildTokenHealth = (
  stateByDex: ReadonlyMap<string, HlClearinghouseState>,
  spotState: HlSpotClearinghouseState,
  quoteAssetByCategory: ReadonlyMap<string, Asset>
): CrossMarginHealth[] => {
  const crossMarginByToken = new Map<string, DecimalString | undefined>()
  const isolatedMarginByToken = new Map<string, DecimalString | undefined>()
  for (const [dex, state] of stateByDex) {
    const token = quoteAssetByCategory.get(dex || PROVIDER_KEY)?.id
    if (token === undefined) {
      continue
    }
    addTokenTerm(crossMarginByToken, token, state.crossMaintenanceMarginUsed)
    for (const { position } of state.assetPositions) {
      if (position.leverage.type === 'isolated') {
        addTokenTerm(isolatedMarginByToken, token, position.marginUsed)
      }
    }
  }

  return [...crossMarginByToken].map(([token, crossMargin]) => {
    const spotTotal =
      spotState.balances.find((b) => String(b.token) === token)?.total ?? '0'
    const isolatedMargin = isolatedMarginByToken.has(token)
      ? isolatedMarginByToken.get(token)
      : '0'
    return buildCrossMarginHealth({
      mode: AccountMode.UNIFIED,
      pool: { type: 'collateralAsset', assetId: token },
      liquidationThreshold: CROSS_LIQUIDATION_THRESHOLD,
      maintenanceMargin: crossMargin,
      equity:
        isolatedMargin === undefined || !isDecimalString(spotTotal)
          ? undefined
          : subtractDecimalString(spotTotal, isolatedMargin),
    })
  })
}

/**
 * The unified account ratio: the largest token ratio, with the token that
 * sets it. Exposure with non-positive equity outranks every ratio, and a token
 * without inputs makes the maximum unknown.
 */
const resolveUnifiedHealth = (
  address: Address,
  tokens: readonly CrossMarginHealth[]
): CrossMarginHealth => {
  const nonPositive = tokens.find(
    (t) => t.status === CrossMarginHealthStatus.NON_POSITIVE_EQUITY
  )
  const unavailable = tokens.find(
    (t) => t.status === CrossMarginHealthStatus.UNAVAILABLE
  )
  const controlling = nonPositive ?? unavailable
  if (controlling !== undefined) {
    return controlling
  }
  let largest:
    | Extract<CrossMarginHealth, { status: CrossMarginHealthStatus.MEASURED }>
    | undefined
  for (const token of tokens) {
    if (
      token.status === CrossMarginHealthStatus.MEASURED &&
      (largest === undefined ||
        compareDecimalStrings(token.ratio, largest.ratio) > 0)
    ) {
      largest = token
    }
  }
  return (
    largest ?? {
      mode: AccountMode.UNIFIED,
      pool: { type: 'account', accountId: address },
      liquidationThreshold: CROSS_LIQUIDATION_THRESHOLD,
      status: CrossMarginHealthStatus.NO_EXPOSURE,
    }
  )
}

/**
 * Cross-margin health of a Hyperliquid account for its abstraction mode.
 * Portfolio margin and DEX abstraction report `UNAVAILABLE`, because the
 * account read carries no authoritative input for their venue metric.
 */
export const buildHyperliquidCrossMarginHealth = (
  address: Address,
  abstraction: HlAbstractionMode | null,
  stateByDex: ReadonlyMap<string, HlClearinghouseState>,
  spotState: HlSpotClearinghouseState,
  quoteAssetByCategory: ReadonlyMap<string, Asset>
): CrossMarginHealth[] => {
  const accountPool = { type: 'account', accountId: address } as const
  switch (abstraction) {
    case HlAbstractionMode.UNIFIED_ACCOUNT:
      return [
        resolveUnifiedHealth(
          address,
          buildTokenHealth(stateByDex, spotState, quoteAssetByCategory)
        ),
      ]
    case HlAbstractionMode.PORTFOLIO_MARGIN:
      return [
        {
          mode: AccountMode.PORTFOLIO_MARGIN,
          pool: accountPool,
          liquidationThreshold: PORTFOLIO_MARGIN_LIQUIDATION_THRESHOLD,
          status: CrossMarginHealthStatus.UNAVAILABLE,
        },
      ]
    case HlAbstractionMode.DEX_ABSTRACTION:
      return [
        {
          mode: AccountMode.DEX_ABSTRACTION,
          pool: accountPool,
          liquidationThreshold: CROSS_LIQUIDATION_THRESHOLD,
          status: CrossMarginHealthStatus.UNAVAILABLE,
        },
      ]
    default:
      // Hyperliquid publishes no standard ratio: this divides the two venue
      // figures that hyperliquid-dex/ts-examples LiquidationPx.tsx reads.
      return [...stateByDex].map(([dex, state]) =>
        buildCrossMarginHealth({
          mode: AccountMode.STANDARD,
          pool: { type: 'dex', categoryId: dex || PROVIDER_KEY },
          liquidationThreshold: CROSS_LIQUIDATION_THRESHOLD,
          maintenanceMargin: state.crossMaintenanceMarginUsed,
          equity: state.crossMarginSummary.accountValue,
        })
      )
  }
}
