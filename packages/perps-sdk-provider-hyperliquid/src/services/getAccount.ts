import {
  getMarkets as coreGetMarkets,
  type PerpsSDKClient,
  type ProviderGetAccountParams,
  type SDKRequestOptions,
  stringToFloat,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Asset,
  Balance,
  HyperliquidAccountConfig,
  Market,
  Position,
} from '@lifi/perps-types'
import { PROVIDER_KEY, SPOT_MARKET_ID } from '../constants.js'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlExtraAgents,
  type HlSpotBalance,
  type HlSpotClearinghouseState,
  type HlUserFees,
} from '../types/index.js'
import {
  marketDisplayFromCoin,
  perpsDexNames,
  requireMarket,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { mapPosition } from '../utils/mapPosition.js'

/**
 * Parameters for {@link getAccount}.
 *
 * @public
 */
export type GetAccountParams = ProviderGetAccountParams

const SPOT_KEY = SPOT_MARKET_ID

const getAccountValue = (state: HlClearinghouseState): number =>
  Number.parseFloat(
    state.crossMarginSummary.accountValue || state.marginSummary.accountValue
  )

const getTotalMarginUsed = (state: HlClearinghouseState): number =>
  Number.parseFloat(
    state.crossMarginSummary.totalMarginUsed ||
      state.marginSummary.totalMarginUsed
  )

const getMarginUsed = (
  abstraction: HlAbstractionMode | null,
  positions: Position[],
  stateByDex: Map<string, HlClearinghouseState>
): string => {
  if (
    abstraction === HlAbstractionMode.UNIFIED_ACCOUNT ||
    abstraction === HlAbstractionMode.PORTFOLIO_MARGIN
  ) {
    // Per HL docs, individual per-dex states are not meaningful for these
    // modes; derive total margin from the already-mapped positions.
    const total = positions.reduce(
      (sum, p) => sum + Number.parseFloat(p.marginUsed),
      0
    )
    return total.toString()
  }

  if (abstraction === HlAbstractionMode.DEX_ABSTRACTION) {
    let total = 0
    for (const [, state] of stateByDex) {
      total += getTotalMarginUsed(state)
    }
    return total.toString()
  }

  const mainState = stateByDex.get('')
  if (!mainState) {
    return '0'
  }
  return getTotalMarginUsed(mainState).toString()
}

const USDC_SYMBOL = 'USDC'

/**
 * Price each token symbol in USD from the backend market list (a market's
 * `markPrice` keyed by its base-asset symbol). Quote/stable symbols fall back
 * to $1.
 */
const buildPriceBySymbol = (
  markets: Market[],
  quoteSymbols: ReadonlySet<string>
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const m of markets) {
    map.set(m.baseAsset.displaySymbol, stringToFloat(m.markPrice))
  }
  for (const symbol of quoteSymbols) {
    if (!map.has(symbol)) {
      map.set(symbol, 1)
    }
  }
  return map
}

const spotAsset = (b: HlSpotBalance): Asset => ({
  ...marketDisplayFromCoin(b.coin).baseAsset,
  id: String(b.token),
})

const isUnifiedMode = (abstraction: HlAbstractionMode | null): boolean =>
  abstraction === HlAbstractionMode.UNIFIED_ACCOUNT ||
  abstraction === HlAbstractionMode.PORTFOLIO_MARGIN

/**
 * Per-dex perps equity, normalised to gross holdings. Hyperliquid reports
 * `accountValue` net of locked margin in `disabled`/`dexAbstraction` modes;
 * add margin back so every consumer's collateral is uniform and mode-agnostic.
 */
const grossVenueEquity = (state: HlClearinghouseState): number =>
  getAccountValue(state) + getTotalMarginUsed(state)

interface BalancePartition {
  balances: Balance[]
  collateralBalances: Balance[]
}

const buildBalances = (
  abstraction: HlAbstractionMode | null,
  spotState: HlSpotClearinghouseState,
  stateByDex: Map<string, HlClearinghouseState>,
  quoteSymbols: ReadonlySet<string>,
  priceBySymbol: Map<string, number>
): BalancePartition => {
  const balances: Balance[] = []
  const collateralBalances: Balance[] = []

  // Spot balances: collateral iff the token is a category quote asset.
  for (const b of spotState.balances) {
    const price = priceBySymbol.get(b.coin) ?? 0
    const balance: Balance = {
      categoryId: SPOT_KEY,
      asset: spotAsset(b),
      units: b.total,
      valueUsd: (stringToFloat(b.total) * price).toString(),
    }
    if (quoteSymbols.has(b.coin)) {
      collateralBalances.push(balance)
    } else {
      balances.push(balance)
    }
  }

  // Unified/portfolio modes hold everything in spot — per-dex equity would
  // double-count. Only disabled/dexAbstraction carry separate venue collateral.
  if (!isUnifiedMode(abstraction)) {
    for (const [dex, state] of stateByDex) {
      const value = grossVenueEquity(state)
      collateralBalances.push({
        categoryId: dex || PROVIDER_KEY,
        asset: {
          ...marketDisplayFromCoin(USDC_SYMBOL).baseAsset,
          id: USDC_SYMBOL,
        },
        units: value.toString(),
        valueUsd: value.toString(),
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
 * `spotClearinghouseState` and one `clearinghouseState` per supported perps
 * sub-dex, all concurrently.
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
  client: PerpsSDKClient,
  apiUrl: string,
  params: GetAccountParams,
  options?: SDKRequestOptions
): Promise<AccountResponse> => {
  const { markets } = await coreGetMarkets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byMarketId = new Map(markets.map((m) => [m.id, m]))
  const dexNames = perpsDexNames(markets)
  const quoteSymbols = new Set<string>()
  for (const m of markets) {
    quoteSymbols.add(m.quoteAsset.displaySymbol)
  }
  const priceBySymbol = buildPriceBySymbol(markets, quoteSymbols)
  const infoOpts = hlInfoOptions(client, options)

  const [feesResult, abstractionResult, agentsResult, spotState, stateResults] =
    await Promise.all([
      infoRequest<HlUserFees>(
        apiUrl,
        { type: 'userFees', user: params.address },
        infoOpts
      ),
      infoRequest<HlAbstractionMode | null>(
        apiUrl,
        { type: 'userAbstraction', user: params.address },
        infoOpts
      ).catch(() => null),
      infoRequest<HlExtraAgents>(
        apiUrl,
        { type: 'extraAgents', user: params.address },
        infoOpts
      ).catch(() => [] as HlExtraAgents),
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
    ])

  const positions: Position[] = stateResults
    .flatMap((state) =>
      state.assetPositions
        .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
        .map((ap) => mapPosition(ap))
    )
    .map((pos) => ({
      ...pos,
      market: requireMarket(byMarketId, pos.market.id),
    }))

  const stateByDex = new Map<string, HlClearinghouseState>()
  stateResults.forEach((state, i) => {
    stateByDex.set(dexNames[i], state)
  })

  const totalUnrealizedPnl = positions.reduce(
    (sum, p) => sum + Number.parseFloat(p.unrealizedPnl),
    0
  )

  const config: HyperliquidAccountConfig = {
    provider: PROVIDER_KEY,
    abstractionMode: abstractionResult,
    agents: agentsResult,
  }

  const { balances, collateralBalances } = buildBalances(
    abstractionResult,
    spotState,
    stateByDex,
    quoteSymbols,
    priceBySymbol
  )

  return {
    provider: PROVIDER_KEY,
    address: params.address,
    balances,
    collateralBalances,
    marginUsed: getMarginUsed(abstractionResult, positions, stateByDex),
    unrealizedPnl: totalUnrealizedPnl.toString(),
    feeTier: {
      maker: feesResult.userAddRate ?? '0',
      taker: feesResult.userCrossRate ?? '0',
    },
    config,
  }
}
