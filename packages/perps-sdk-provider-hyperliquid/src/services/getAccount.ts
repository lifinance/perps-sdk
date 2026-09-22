import {
  getMarketRegistry,
  getMarketsContext,
  type ProviderGetAccountParams,
  type SDKRequestOptions,
  stringToFloat,
  toPerpsMarketDisplay,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Asset,
  Balance,
  HyperliquidAccountConfig,
  HyperliquidDexAccountState,
  Position,
} from '@lifi/perps-types'
import type Big from 'big.js'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlAbstractionMode,
  HlClearinghouseState,
  HlExtraAgents,
  HlSpotClearinghouseState,
  HlUserFees,
} from '../types/index.js'
import { isUnifiedAbstraction } from '../utils/abstractionMode.js'
import { toWireBig } from '../utils/decimal.js'
import {
  assetIsOutcome,
  partitionSpotBalances,
  perpsDexNames,
  perpsTotals,
  spotAssetFromToken,
  spotBalance,
  spotPriceById,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { isOpenAssetPosition, mapPosition } from '../utils/mapPosition.js'

/**
 * Parameters for {@link getAccount}.
 *
 * @public
 */
export type GetAccountParams = ProviderGetAccountParams

// `marginSummary` covers the whole account (cross AND isolated positions);
// `crossMarginSummary` is the cross-only subset and would drop isolated
// equity/margin.
const getAccountValue = (state: HlClearinghouseState): Big =>
  toWireBig(state.marginSummary.accountValue, 'marginSummary.accountValue')

/** Venue buying power for the quote asset the perps dex settles in. */
const getAvailableAfterMaintenance = (
  spotState: HlSpotClearinghouseState,
  quoteAssetId: string | undefined
): string | undefined =>
  spotState.tokenToAvailableAfterMaintenance.find(
    ([token]) => String(token) === quoteAssetId
  )?.[1]

interface BalancePartition {
  balances: Balance[]
  collateralBalances: Balance[]
}

const buildBalances = (
  abstraction: HlAbstractionMode | null,
  spotState: HlSpotClearinghouseState,
  stateByDex: Map<string, HlClearinghouseState>,
  quoteAssetIds: ReadonlySet<string>,
  priceById: Map<string, number>,
  quoteAssetByCategory: Map<string, Asset>
): BalancePartition => {
  const { balances, collateralBalances } = partitionSpotBalances(
    spotState.balances
      .filter((b) => !assetIsOutcome(b.coin))
      .map((b) => spotBalance(spotAssetFromToken(b), b.total, priceById)),
    quoteAssetIds
  )

  // Unified/portfolio modes hold everything in spot — per-dex equity would
  // double-count. Only disabled/dexAbstraction carry separate venue collateral.
  // `accountValue` is the dex's TOTAL equity: locked margin and unrealized
  // PnL are already included, so summaries must not add them on top.
  if (!isUnifiedAbstraction(abstraction)) {
    for (const [dex, state] of stateByDex) {
      const categoryId = dex || PROVIDER_KEY
      const value = getAccountValue(state)
      if (!value.gt(0)) {
        continue
      }
      collateralBalances.push({
        categoryId,
        // Always present: every dex in `stateByDex` derives from `markets`,
        // which is what populates `quoteAssetByCategory`.
        asset: quoteAssetByCategory.get(categoryId)!,
        units: value.toFixed(),
        valueUsd: value.toFixed(),
        price: '1',
      })
    }
  }

  return { balances, collateralBalances }
}

/**
 * Fetch the Hyperliquid account snapshot for `address`: balances per
 * sub-dex (and spot), aggregate margin used, unrealised PnL, fee tier, and
 * the typed `HyperliquidAccountConfig`.
 *
 * Issues `userFees`, `userAbstraction`, `extraAgents`,
 * `spotClearinghouseState` and one `clearinghouseState` per perps sub-dex that
 * still has a live market, all concurrently. USDC parked manually on a
 * sub-dex whose every market is delisted is therefore not reported.
 *
 * `config.builderFeeApproval` is intentionally omitted — that field
 * compares the venue's `maxBuilderFee` against the integrator-specific
 * builder address LI.FI publishes, which is not data the venue itself
 * owns. Surfacing it belongs at a higher layer (the LI.FI backend or a
 * thin client-side helper that has the integrator's builder config).
 * @throws {PerpsError} On Hyperliquid REST error, network, or parsing failures.
 * @public
 */
export const getAccount = async (
  { client, apiUrl }: HyperliquidContext,
  params: GetAccountParams,
  options?: SDKRequestOptions
): Promise<AccountResponse> => {
  const registry = getMarketRegistry(client, PROVIDER_KEY)
  const markets = await registry.sync()
  const dexNames = perpsDexNames(markets)
  const quoteAssetIds = new Set(markets.map((m) => m.quoteAsset.id))
  const quoteAssetByCategory = new Map(
    markets.map((m) => [m.categoryId, m.quoteAsset])
  )
  const infoOpts = hlInfoOptions(client, options)

  const [
    feesResult,
    abstractionResult,
    agentsResult,
    spotState,
    stateResults,
    { prices },
  ] = await Promise.all([
    infoRequest<HlUserFees>(
      apiUrl,
      { type: 'userFees', user: params.address },
      infoOpts
    ),
    // "Never set abstraction" is a successful 200 `null` body, not an error —
    // so a fetch failure must propagate, never be coerced to `null` (which
    // would silently route margin/balance down the wrong, non-unified branch).
    infoRequest<HlAbstractionMode | null>(
      apiUrl,
      { type: 'userAbstraction', user: params.address },
      infoOpts
    ),
    infoRequest<HlExtraAgents>(
      apiUrl,
      { type: 'extraAgents', user: params.address },
      infoOpts
    ),
    infoRequest<HlSpotClearinghouseState>(
      apiUrl,
      { type: 'spotClearinghouseState', user: params.address },
      infoOpts
    ),
    Promise.all(
      dexNames.map((name) =>
        infoRequest<HlClearinghouseState>(
          apiUrl,
          {
            type: 'clearinghouseState',
            user: params.address,
            ...(name ? { dex: name } : {}),
          },
          infoOpts
        )
      )
    ),
    getMarketsContext(client, { provider: PROVIDER_KEY }, options),
  ])

  const priceById = spotPriceById(
    markets,
    new Map(prices.map((p) => [p.marketId, stringToFloat(p.markPrice)]))
  )

  const positions: Position[] = stateResults.flatMap((state) =>
    state.assetPositions
      .filter(
        (ap) => !assetIsOutcome(ap.position.coin) && isOpenAssetPosition(ap)
      )
      .map((ap) =>
        mapPosition(
          ap,
          toPerpsMarketDisplay(registry.require(ap.position.coin))
        )
      )
  )

  const stateByDex = new Map<string, HlClearinghouseState>()
  stateResults.forEach((state, i) => {
    stateByDex.set(dexNames[i], state)
  })

  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + Number.parseFloat(p.unrealizedPnl),
    0
  )

  const dexStates: HyperliquidDexAccountState[] = stateResults.map(
    (state, i) => ({
      dex: dexNames[i],
      marginSummary: state.marginSummary,
      crossMarginSummary: state.crossMarginSummary,
      crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
      withdrawable: state.withdrawable,
    })
  )

  const config: HyperliquidAccountConfig = {
    provider: PROVIDER_KEY,
    abstractionMode: abstractionResult,
    agents: agentsResult,
    dexStates,
    ...(isUnifiedAbstraction(abstractionResult)
      ? {
          availableAfterMaintenance: getAvailableAfterMaintenance(
            spotState,
            quoteAssetByCategory.get(PROVIDER_KEY)?.id
          ),
        }
      : {}),
  }

  const { balances, collateralBalances } = buildBalances(
    abstractionResult,
    spotState,
    stateByDex,
    quoteAssetIds,
    priceById,
    quoteAssetByCategory
  )

  return {
    provider: PROVIDER_KEY,
    address: params.address,
    balances,
    collateralBalances,
    positions,
    marginUsed: perpsTotals(dexStates).marginUsed.toFixed(),
    unrealizedPnl: totalUnrealizedPnl.toString(),
    feeTier: {
      maker: feesResult.userAddRate ?? '0',
      taker: feesResult.userCrossRate ?? '0',
    },
    config,
  }
}
