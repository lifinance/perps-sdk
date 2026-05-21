import { PerpsError } from '@lifi/perps-sdk'
import type { OhlcvInterval, OhlcvResponse } from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import {
  assetIsSpot,
  type HlCandleSnapshot,
} from '@lifi/perps-types/providers/hyperliquid'
import { fetchAllPerpAssetsRaw } from '../assetLookups.js'
import {
  DEFAULT_CANDLE_LIMIT,
  DEFAULT_OHLCV_LOOKBACK_MS,
  MAX_CANDLE_LIMIT,
  PROVIDER_KEY,
} from '../constants.js'
import { type InfoRequestOptions, infoRequest } from '../infoClient.js'
import { purrSpotOverride, resolveSpotPair } from '../spot.js'

export interface GetOhlcvParams {
  symbol: string
  interval: OhlcvInterval
  startTime?: number
  endTime?: number
  limit?: number
}

const assertAssetExists = async (
  apiUrl: string,
  symbol: string,
  options?: InfoRequestOptions
): Promise<void> => {
  if (assetIsSpot(symbol)) {
    await resolveSpotPair(apiUrl, symbol, options)
    return
  }
  const raw = await fetchAllPerpAssetsRaw(apiUrl, options)
  const found = raw.find((m) => m.universe.name === symbol)
  if (!found) {
    const err = new PerpsError(
      PerpsErrorCode.MarketNotFound,
      `Asset not found: ${symbol}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }
}

/**
 * Fetch OHLCV candles for `symbol` at `interval`. `startTime` defaults to 24
 * hours ago; results are clamped to `MAX_CANDLE_LIMIT` (1 000) regardless of
 * the requested `limit`.
 *
 * `candleSnapshot` is the only `/info` endpoint that nests its parameters
 * under `{ type, req: {...} }`; this wrapper hides the inconsistency.
 */
export const getOhlcv = async (
  apiUrl: string,
  params: GetOhlcvParams,
  options?: InfoRequestOptions
): Promise<OhlcvResponse> => {
  await assertAssetExists(apiUrl, params.symbol, options)

  const now = Date.now()
  const startTime = params.startTime ?? now - DEFAULT_OHLCV_LOOKBACK_MS

  const candles = await infoRequest<HlCandleSnapshot>(
    apiUrl,
    {
      type: 'candleSnapshot',
      req: {
        coin: purrSpotOverride(params.symbol),
        interval: params.interval,
        startTime,
        ...(params.endTime !== undefined ? { endTime: params.endTime } : {}),
      },
    },
    options
  )

  const limit = Math.min(params.limit ?? DEFAULT_CANDLE_LIMIT, MAX_CANDLE_LIMIT)
  const endTime = params.endTime

  const filtered = candles
    .filter(
      (c) => c.t >= startTime && (endTime === undefined || c.t <= endTime)
    )
    .slice(0, limit)
    .map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }))

  return {
    provider: PROVIDER_KEY,
    assetId: params.symbol,
    interval: params.interval,
    candles: filtered,
  }
}
