import {
  getMarkets as coreGetMarkets,
  type ProviderGetAccountParams,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Balance,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlExtraAgents,
  type HlSpotClearinghouseState,
  type HlUserFees,
} from '../types/index.js'
import {
  marketDisplayFromCoin,
  perpsDexNames,
  requireMarket,
  spotBalance,
  spotPriceByCoin,
} from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { mapPosition } from '../utils/mapPosition.js'

/**
 * Parameters for {@link getAccount}.
 *
 * @public
 */
export type GetAccountParams = ProviderGetAccountParams

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

const isUnifiedMode = (abstraction: HlAbstractionMode | null): boolean =>
  abstraction === HlAbstractionMode.UNIFIED_ACCOUNT ||
  abstraction === HlAbstractionMode.PORTFOLIO_MARGIN

interface BalancePartition {
  balances: Balance[]
  collateralBalances: Balance[]
}

const buildBalances = (
  abstraction: HlAbstractionMode | null,
  spotState: HlSpotClearinghouseState,
  stateByDex: Map<string, HlClearinghouseState>,
  quoteSymbols: ReadonlySet<string>,
  priceByCoin: Map<string, number>
): BalancePartition => {
  const balances: Balance[] = []
  const collateralBalances: Balance[] = []

  // Spot balances: collateral iff the token is a category quote asset.
  for (const b of spotState.balances) {
    const balance = spotBalance(b, priceByCoin)
    if (quoteSymbols.has(b.coin)) {
      collateralBalances.push(balance)
    } else {
      balances.push(balance)
    }
  }

  // Unified/portfolio modes hold everything in spot — per-dex equity would
  // double-count. Only disabled/dexAbstraction carry separate venue collateral.
  // `accountValue` is reported net of locked margin, i.e. the free collateral;
  // the locked portion is carried by the positions' `marginUsed`.
  if (!isUnifiedMode(abstraction)) {
    for (const [dex, state] of stateByDex) {
      const value = getAccountValue(state)
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
  { client, apiUrl }: HyperliquidContext,
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
  const priceByCoin = spotPriceByCoin(markets)
  const infoOpts = hlInfoOptions(client, options)

  const [feesResult, abstractionResult, agentsResult, spotState, stateResults] =
    await Promise.all([
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
    ])

  const positions: Position[] = stateResults.flatMap((state) =>
    state.assetPositions
      .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
      .map((ap) => mapPosition(ap, requireMarket(byMarketId, ap.position.coin)))
  )

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
    priceByCoin
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
