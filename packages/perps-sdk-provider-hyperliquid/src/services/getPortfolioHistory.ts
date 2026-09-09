import { PerpsError, type SDKRequestOptions } from '@lifi/perps-sdk'
import {
  PerpsErrorCode,
  type PortfolioHistoryRange,
  type PortfolioHistoryResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import type { HyperliquidContext } from '../context.js'
import type { HlPortfolio, HlPortfolioPeriod } from '../types/index.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'

/** Parameters for {@link getPortfolioHistory}. @public */
export interface GetPortfolioHistoryParams {
  address: Address
  range: PortfolioHistoryRange
}

const PERIOD_BY_RANGE: Record<PortfolioHistoryRange, HlPortfolioPeriod> = {
  '24h': 'day',
  '7d': 'week',
  '30d': 'month',
  all: 'allTime',
}

/**
 * Read the account's portfolio value and cumulative PnL for `params.range`
 * from one `portfolio` info request. `pnlHistory` and `accountValueHistory`
 * are joined by position, so a point carries `'0'` PnL when the PnL series
 * is shorter.
 * @public
 */
export async function getPortfolioHistory(
  ctx: HyperliquidContext,
  params: GetPortfolioHistoryParams,
  options?: SDKRequestOptions
): Promise<PortfolioHistoryResponse> {
  const { client, apiUrl } = ctx
  const period = PERIOD_BY_RANGE[params.range]
  const portfolio = await infoRequest<HlPortfolio>(
    apiUrl,
    { type: 'portfolio', user: params.address },
    hlInfoOptions(client, options)
  )
  const window = portfolio.find(([key]) => key === period)?.[1]
  if (window === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid portfolio response has no '${period}' window.`
    )
  }

  const points = window.accountValueHistory.map(
    ([timestamp, accountValue], i) => ({
      timestamp,
      accountValue,
      pnl: window.pnlHistory[i]?.[1] ?? '0',
    })
  )
  const last = window.pnlHistory.at(-1)
  return {
    range: params.range,
    points,
    volume: window.vlm,
    totalPnl: last?.[1],
  }
}
