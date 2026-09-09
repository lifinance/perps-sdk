import { PerpsError, type SDKRequestOptions } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type PortfolioHistoryPoint,
  type PortfolioHistoryRange,
  type PortfolioHistoryResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type { HyperliquidContext } from '../context.js'
import type {
  HlAbstractionMode,
  HlPortfolio,
  HlPortfolioPeriod,
  HlPortfolioWindow,
} from '../types/index.js'
import { isUnifiedAbstraction } from '../utils/abstractionMode.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/** Parameters for {@link getPortfolioHistory}. @public */
export interface GetPortfolioHistoryParams {
  address: Address
  range: PortfolioHistoryRange
}

const COMBINED_PERIOD_BY_RANGE: Record<
  PortfolioHistoryRange,
  HlPortfolioPeriod
> = {
  '24h': 'day',
  '7d': 'week',
  '30d': 'month',
  all: 'allTime',
}

const PERP_PERIOD_BY_RANGE: Record<PortfolioHistoryRange, HlPortfolioPeriod> = {
  '24h': 'perpDay',
  '7d': 'perpWeek',
  '30d': 'perpMonth',
  all: 'perpAllTime',
}

/**
 * Join the window's two series on their timestamps. `pnlHistory` is cumulative
 * from the window's start, so a point with no PnL sample carries the last
 * sampled value — `'0'` before the first one.
 */
const joinWindow = (
  window: HlPortfolioWindow,
  period: HlPortfolioPeriod
): PortfolioHistoryPoint[] => {
  const pnlByTimestamp = new Map(window.pnlHistory)
  let matched = 0
  let cumulative = '0'
  const points = window.accountValueHistory.map(([timestamp, accountValue]) => {
    const sample = pnlByTimestamp.get(timestamp)
    if (sample !== undefined) {
      matched += 1
      cumulative = sample
    }
    return { timestamp, accountValue, pnl: cumulative }
  })
  if (points.length > 0 && window.pnlHistory.length > 0 && matched === 0) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid portfolio window '${period}' samples PnL on no ` +
        'account-value timestamp.'
    )
  }
  return points
}

/**
 * Read the account's portfolio value and cumulative PnL for `params.range`
 * from one `portfolio` info request. An account whose collateral lives
 * per-dex reads the perps-only window; a unified or portfolio-margin account
 * holds its collateral in spot, so it reads the combined window.
 * @public
 */
export async function getPortfolioHistory(
  ctx: HyperliquidContext,
  params: GetPortfolioHistoryParams,
  options?: SDKRequestOptions
): Promise<PortfolioHistoryResponse> {
  const { client, apiUrl } = ctx
  const infoOpts = hlInfoOptions(client, options)
  const [portfolio, abstraction] = await Promise.all([
    infoRequest<HlPortfolio>(
      apiUrl,
      { type: 'portfolio', user: params.address },
      infoOpts
    ),
    // "Never set abstraction" is a successful 200 `null` body, not an error —
    // so a fetch failure must propagate, never be coerced to `null` (which
    // would silently read the combined window for a perps-only account).
    infoRequest<HlAbstractionMode | null>(
      apiUrl,
      { type: 'userAbstraction', user: params.address },
      infoOpts
    ),
  ])
  const period = isUnifiedAbstraction(abstraction)
    ? COMBINED_PERIOD_BY_RANGE[params.range]
    : PERP_PERIOD_BY_RANGE[params.range]
  const window = portfolio.find(([key]) => key === period)?.[1]
  if (window === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid portfolio response has no '${period}' window.`
    )
  }

  return {
    range: params.range,
    points: joinWindow(window, period),
    volume: window.vlm,
    totalPnl: window.pnlHistory.at(-1)?.[1],
  }
}
