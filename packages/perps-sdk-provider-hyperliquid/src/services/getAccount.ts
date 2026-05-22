import type {
  AccountResponse,
  Address,
  Balance,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlExtraAgents,
  type HlSpotClearinghouseState,
  type HlUserFees,
} from '@lifi/perps-types/providers/hyperliquid'
import {
  buildAssetEnrichmentMaps,
  resolveDisplayQuote,
  resolveDisplaySymbol,
} from '../assetLookups.js'
import { PROVIDER_KEY } from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'
import { mapPosition } from '../mappers/index.js'
import { buildMarketQuoteAssetMap, getSupportedSubDexes } from '../subdexes.js'

export interface GetAccountParams {
  address: Address
}

const SPOT_KEY = 'spot'

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

const buildSpotBalances = (state: HlSpotClearinghouseState): Balance[] =>
  state.balances.map((b) => ({ currency: b.coin, amount: b.total }))

const buildDexAbstractionBalances = (
  stateByDex: Map<string, HlClearinghouseState>,
  marketQuoteAssets: Map<string, string>
): Balance[] => {
  const totals = new Map<string, number>()
  for (const [dex, state] of stateByDex) {
    const quote = marketQuoteAssets.get(dex) ?? 'USDC'
    const value = getAccountValue(state)
    totals.set(quote, (totals.get(quote) ?? 0) + value)
  }
  return [...totals.entries()].map(([currency, amount]) => ({
    currency,
    amount: amount.toString(),
  }))
}

const buildPerMarketBalances = (
  stateByDex: Map<string, HlClearinghouseState>,
  marketQuoteAssets: Map<string, string>
): Record<string, Balance[]> => {
  const result: Record<string, Balance[]> = {}
  for (const [dex, state] of stateByDex) {
    const quote = marketQuoteAssets.get(dex) ?? 'USDC'
    const value = getAccountValue(state)
    const key = dex || PROVIDER_KEY
    const existing = result[key] ?? []
    existing.push({ currency: quote, amount: value.toString() })
    result[key] = existing
  }
  return result
}

const buildBalances = (
  abstraction: HlAbstractionMode | null,
  spotState: HlSpotClearinghouseState,
  stateByDex: Map<string, HlClearinghouseState>,
  marketQuoteAssets: Map<string, string>
): Record<string, Balance[]> => {
  const spot = buildSpotBalances(spotState)

  if (
    abstraction === HlAbstractionMode.UNIFIED_ACCOUNT ||
    abstraction === HlAbstractionMode.PORTFOLIO_MARGIN
  ) {
    return { [SPOT_KEY]: spot }
  }

  if (abstraction === HlAbstractionMode.DEX_ABSTRACTION) {
    return {
      [SPOT_KEY]: spot,
      [PROVIDER_KEY]: buildDexAbstractionBalances(
        stateByDex,
        marketQuoteAssets
      ),
    }
  }

  return {
    [SPOT_KEY]: spot,
    ...buildPerMarketBalances(stateByDex, marketQuoteAssets),
  }
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
 */
export const getAccount = async (
  apiUrl: string,
  params: GetAccountParams,
  options?: InfoRequestOptions
): Promise<AccountResponse> => {
  const dexNamesPromise = getSupportedSubDexes(apiUrl, options)

  const [
    dexNames,
    marketQuoteAssets,
    feesResult,
    abstractionResult,
    agentsResult,
    spotState,
    stateResults,
    enrichmentMaps,
  ] = await Promise.all([
    dexNamesPromise,
    buildMarketQuoteAssetMap(apiUrl, options),
    infoRequest<HlUserFees>(
      apiUrl,
      { type: 'userFees', user: params.address },
      options
    ),
    infoRequest<HlAbstractionMode | null>(
      apiUrl,
      { type: 'userAbstraction', user: params.address },
      options
    ).catch(() => null),
    infoRequest<HlExtraAgents>(
      apiUrl,
      { type: 'extraAgents', user: params.address },
      options
    ).catch(() => [] as HlExtraAgents),
    infoRequest<HlSpotClearinghouseState>(
      apiUrl,
      { type: 'spotClearinghouseState', user: params.address },
      options
    ),
    dexNamesPromise.then((names) =>
      Promise.all(
        names.map((name) =>
          infoRequest<HlClearinghouseState>(
            apiUrl,
            {
              type: 'clearinghouseState',
              user: params.address,
              ...(name ? { dex: name } : {}),
            },
            options
          )
        )
      )
    ),
    buildAssetEnrichmentMaps(apiUrl, options),
  ])

  const rawPositions = stateResults.flatMap((state) =>
    state.assetPositions
      .filter((ap) => Number.parseFloat(ap.position.szi) !== 0)
      .map((ap) => mapPosition(ap))
  )

  const positions: Position[] = rawPositions.map((pos) => {
    const market = enrichmentMaps.assetMarketMap.get(pos.asset.assetId) ?? ''
    return {
      ...pos,
      asset: {
        ...pos.asset,
        market,
        displaySymbol: resolveDisplaySymbol(pos.asset.assetId, enrichmentMaps),
        displayQuote: resolveDisplayQuote(pos.asset.assetId, enrichmentMaps),
      },
    }
  })

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

  return {
    provider: PROVIDER_KEY,
    address: params.address,
    balances: buildBalances(
      abstractionResult,
      spotState,
      stateByDex,
      marketQuoteAssets
    ),
    marginUsed: getMarginUsed(abstractionResult, positions, stateByDex),
    unrealizedPnl: totalUnrealizedPnl.toString(),
    feeTier: {
      maker: feesResult.userAddRate ?? '0',
      taker: feesResult.userCrossRate ?? '0',
    },
    config,
  }
}
