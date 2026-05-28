import {
  getAssets as coreGetAssets,
  type PerpsSDKClient,
  type SDKRequestOptions,
} from '@lifi/perps-sdk'
import type {
  AccountResponse,
  Balance,
  HyperliquidAccountConfig,
  Position,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import {
  HlAbstractionMode,
  type HlClearinghouseState,
  type HlExtraAgents,
  type HlSpotClearinghouseState,
  type HlUserFees,
} from '../types/index.js'
import { mapPosition, perpsDexNames, requireAsset } from '../utils/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

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
  client: PerpsSDKClient,
  apiUrl: string,
  params: GetAccountParams,
  options?: SDKRequestOptions
): Promise<AccountResponse> => {
  const { assets } = await coreGetAssets(
    client,
    { provider: PROVIDER_KEY },
    options
  )
  const byAssetId = new Map(assets.map((a) => [a.assetId, a]))
  const dexNames = perpsDexNames(assets)
  const quoteByMarket = new Map<string, string>()
  for (const a of assets) {
    if (a.market !== 'spot' && a.displayQuote !== null) {
      quoteByMarket.set(a.market, a.displayQuote)
    }
  }
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
      asset: requireAsset(byAssetId, pos.asset.assetId),
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

  return {
    provider: PROVIDER_KEY,
    address: params.address,
    balances: buildBalances(
      abstractionResult,
      spotState,
      stateByDex,
      quoteByMarket
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
