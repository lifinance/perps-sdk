import {
  buildPortfolioHistoryWindow,
  createWarnOnce,
  PerpsError,
  type PortfolioHistoryWindow,
  type SDKRequestOptions,
  warnSkippedVenueRow,
} from '@lifi/perps-sdk'
import {
  type DecimalString,
  PerpsErrorCode,
  type PortfolioHistoryBounds,
  type PortfolioHistoryPoint,
  type PortfolioHistoryRange,
  type PortfolioHistoryResponse,
} from '@lifi/perps-types'
import type { Address } from 'viem'
import { PROVIDER_KEY } from '../constants.js'
import type { HyperliquidContext } from '../context.js'
import type {
  HlAbstractionMode,
  HlPortfolio,
  HlPortfolioPeriod,
  HlPortfolioWindow,
} from '../types/index.js'
import { isUnifiedAbstraction } from '../utils/abstractionMode.js'
import { hlInfoOptions, infoRequest } from '../utils/infoClient.js'
import { mapPortfolioTransfers } from '../utils/mapPortfolioTransfers.js'
import { requireAccountExists } from './getAccountExists.js'
import { getLedgerHistory } from './getLedgerHistory.js'

/** Parameters for {@link getPortfolioHistory}. @public */
export interface GetPortfolioHistoryParams {
  address: Address
  range: PortfolioHistoryRange
  bounds?: PortfolioHistoryBounds
}

/** The venue presets of one account scope, narrowest first. */
const COMBINED_PERIODS: readonly HlPortfolioPeriod[] = [
  'day',
  'week',
  'month',
  'allTime',
]
const PERP_PERIODS: readonly HlPortfolioPeriod[] = [
  'perpDay',
  'perpWeek',
  'perpMonth',
  'perpAllTime',
]
const PERIOD_INDEX_BY_RANGE: Record<PortfolioHistoryRange, number> = {
  '24h': 0,
  '7d': 1,
  '30d': 2,
  all: 3,
}

/** The samples with a finite timestamp; each other sample is skipped. */
const validSamples = (
  samples: HlPortfolioWindow['pnlHistory'],
  row: string
): [number, DecimalString][] =>
  samples.flatMap(([timestamp, value]): [number, DecimalString][] => {
    if (!Number.isFinite(timestamp)) {
      warnSkippedVenueRow(PROVIDER_KEY, row, 'timestamp', timestamp, {
        expected: 'timestamp',
      })
      return []
    }
    return [[timestamp, value]]
  })

/**
 * Join the window's two series on their timestamps. `pnlHistory` is cumulative
 * from the window's start, so a point with no PnL sample carries the last
 * sampled value — `'0'` before the first one. `totalPnl` is the last valid
 * PnL sample.
 */
const joinWindow = (
  window: HlPortfolioWindow,
  period: HlPortfolioPeriod
): { points: PortfolioHistoryPoint[]; totalPnl: DecimalString | undefined } => {
  const pnlHistory = validSamples(window.pnlHistory, 'portfolio PnL sample')
  const pnlByTimestamp = new Map(pnlHistory)
  let matched = 0
  let cumulative = '0'
  const points = validSamples(
    window.accountValueHistory,
    'portfolio value sample'
  ).map(([timestamp, accountValue]) => {
    const sample = pnlByTimestamp.get(timestamp)
    if (sample !== undefined) {
      matched += 1
      cumulative = sample
    }
    return { timestamp, accountValue, pnl: cumulative }
  })
  if (points.length > 0 && pnlHistory.length > 0 && matched === 0) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid portfolio window '${period}' samples PnL on no ` +
        'account-value timestamp.'
    )
  }
  return { points, totalPnl: pnlHistory.at(-1)?.[1] }
}

const resolveWindow = (
  portfolio: HlPortfolio,
  period: HlPortfolioPeriod
): HlPortfolioWindow => {
  const window = portfolio.find(([key]) => key === period)?.[1]
  if (window === undefined) {
    throw new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid portfolio response has no '${period}' window.`
    )
  }
  return window
}

const warnUnjoinablePresetOnce = createWarnOnce()

/**
 * The bounded native samples when they hold an opening sample at or before
 * `bounds.start`. Otherwise the samples of the narrowest wider preset of the
 * same scope that holds one, or the native samples without an opening when
 * no preset holds one. A wider preset the venue did not send, or whose
 * series do not join, is skipped: the native samples are already usable, so
 * the wider preset warns instead of failing the read.
 */
const resolveBoundedWindow = (
  portfolio: HlPortfolio,
  periods: readonly HlPortfolioPeriod[],
  nativeIndex: number,
  nativePoints: PortfolioHistoryPoint[],
  bounds: PortfolioHistoryBounds
): PortfolioHistoryWindow => {
  const native = buildPortfolioHistoryWindow(PROVIDER_KEY, nativePoints, bounds)
  if (native.opening !== undefined) {
    return native
  }
  for (const period of periods.slice(nativeIndex + 1)) {
    const window = portfolio.find(([key]) => key === period)?.[1]
    if (window === undefined) {
      continue
    }
    let widerPoints: PortfolioHistoryPoint[]
    try {
      widerPoints = joinWindow(window, period).points
    } catch (error) {
      if (!(error instanceof PerpsError)) {
        throw error
      }
      warnUnjoinablePresetOnce(
        period,
        `[${PROVIDER_KEY}] portfolio window '${period}' gives no opening sample: ${error.message}`
      )
      continue
    }
    const candidate = buildPortfolioHistoryWindow(
      PROVIDER_KEY,
      widerPoints,
      bounds
    )
    if (candidate.opening !== undefined) {
      return candidate
    }
  }
  return native
}

/**
 * Read the account's portfolio value and cumulative PnL for `params.range`
 * from one `portfolio` info request. An account whose collateral lives
 * per-dex reads the perps-only window; a unified or portfolio-margin account
 * holds its collateral in spot, so it reads the combined window. With
 * `params.bounds`, the read takes the opening sample from the native preset,
 * or from a wider preset of the same scope when the native one has none, and
 * reads the ledger from the first retained sample. `volume` stays the native
 * preset total.
 * @public
 */
export async function getPortfolioHistory(
  ctx: HyperliquidContext,
  params: GetPortfolioHistoryParams,
  options?: SDKRequestOptions
): Promise<PortfolioHistoryResponse> {
  const { client, apiUrl } = ctx
  const infoOpts = hlInfoOptions(client, options)
  await requireAccountExists(apiUrl, params.address, infoOpts)
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
  const combined = isUnifiedAbstraction(abstraction)
  const periods = combined ? COMBINED_PERIODS : PERP_PERIODS
  const nativeIndex = PERIOD_INDEX_BY_RANGE[params.range]
  const nativeWindow = resolveWindow(portfolio, periods[nativeIndex])
  const native = joinWindow(nativeWindow, periods[nativeIndex])

  const { bounds } = params
  const selected: PortfolioHistoryWindow =
    bounds === undefined
      ? { points: native.points }
      : resolveBoundedWindow(
          portfolio,
          periods,
          nativeIndex,
          native.points,
          bounds
        )
  const retained =
    selected.opening === undefined
      ? selected.points
      : [selected.opening, ...selected.points]
  const first = retained[0]
  const last = retained.at(-1)
  const ledger =
    first !== undefined &&
    last !== undefined &&
    last.timestamp > first.timestamp
      ? await getLedgerHistory(
          apiUrl,
          {
            user: params.address,
            startTime: first.timestamp,
            endTime: last.timestamp,
          },
          infoOpts
        )
      : []
  const withTransfers = mapPortfolioTransfers(
    retained,
    ledger,
    params.address,
    combined
  )
  const openingCount = selected.opening === undefined ? 0 : 1
  const points = withTransfers.slice(openingCount)
  return {
    range: params.range,
    ...(openingCount === 0 ? {} : { opening: withTransfers[0] }),
    points,
    volume: nativeWindow.vlm,
    totalPnl: bounds === undefined ? native.totalPnl : points.at(-1)?.pnl,
  }
}
