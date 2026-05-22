import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { LighterApiClient } from './apiClient.js'
import type {
  LtAssetDetailsResponse,
  LtFundingRatesResponse,
  LtOrderBookDetailsResponse,
  LtPerpsOrderBookDetail,
  LtSpotOrderBookDetail,
  LtTokenListResponse,
} from './apiTypes.js'
import {
  LIGHTER_LOGO_BASE_URL,
  LIGHTER_PROVIDER_KEY,
  MARKET_STATUS_ACTIVE,
} from './constants.js'

/**
 * Per-instance metadata cache for Lighter market reference data. The same
 * `orderBookDetails` / `fundingRates` / `tokenlist` / `assetDetails` payloads
 * back every read (symbol↔market_id, market_id→symbol, asset_id→symbol,
 * token logos, funding rates). Refresh TTL mirrors the backend's
 * `API_CACHE_TTL` table (1 hour for stable metadata, 60s for fundings).
 */
export class LighterMarketRegistry {
  private readonly client: LighterApiClient
  private readonly metadataTtlMs: number
  private readonly fundingsTtlMs: number

  private orderBookDetailsPromise:
    | Promise<LtOrderBookDetailsResponse>
    | undefined
  private orderBookDetailsAt = 0

  private fundingRatesPromise: Promise<LtFundingRatesResponse> | undefined
  private fundingRatesAt = 0

  private tokenListPromise: Promise<LtTokenListResponse> | undefined
  private tokenListAt = 0

  private assetDetailsPromise: Promise<LtAssetDetailsResponse> | undefined
  private assetDetailsAt = 0

  constructor(
    client: LighterApiClient,
    options?: { metadataTtlMs?: number; fundingsTtlMs?: number }
  ) {
    this.client = client
    this.metadataTtlMs = options?.metadataTtlMs ?? 60 * 60 * 1000
    this.fundingsTtlMs = options?.fundingsTtlMs ?? 60 * 1000
  }

  async orderBookDetails(): Promise<LtOrderBookDetailsResponse> {
    if (
      this.orderBookDetailsPromise === undefined ||
      Date.now() - this.orderBookDetailsAt > this.metadataTtlMs
    ) {
      this.orderBookDetailsAt = Date.now()
      this.orderBookDetailsPromise =
        this.client.get<LtOrderBookDetailsResponse>('/api/v1/orderBookDetails')
    }
    return this.orderBookDetailsPromise
  }

  async fundingRates(): Promise<LtFundingRatesResponse> {
    if (
      this.fundingRatesPromise === undefined ||
      Date.now() - this.fundingRatesAt > this.fundingsTtlMs
    ) {
      this.fundingRatesAt = Date.now()
      this.fundingRatesPromise = this.client.get<LtFundingRatesResponse>(
        '/api/v1/funding-rates'
      )
    }
    return this.fundingRatesPromise
  }

  async tokenList(): Promise<LtTokenListResponse> {
    if (
      this.tokenListPromise === undefined ||
      Date.now() - this.tokenListAt > this.metadataTtlMs
    ) {
      this.tokenListAt = Date.now()
      this.tokenListPromise =
        this.client.get<LtTokenListResponse>('/api/v1/tokenlist')
    }
    return this.tokenListPromise
  }

  async assetDetails(): Promise<LtAssetDetailsResponse> {
    if (
      this.assetDetailsPromise === undefined ||
      Date.now() - this.assetDetailsAt > this.metadataTtlMs
    ) {
      this.assetDetailsAt = Date.now()
      this.assetDetailsPromise = this.client.get<LtAssetDetailsResponse>(
        '/api/v1/assetDetails'
      )
    }
    return this.assetDetailsPromise
  }

  async activePerps(): Promise<LtPerpsOrderBookDetail[]> {
    const details = await this.orderBookDetails()
    return details.order_book_details.filter(
      (m) => m.status === MARKET_STATUS_ACTIVE && !m.market_config.hidden
    )
  }

  async activeSpots(): Promise<LtSpotOrderBookDetail[]> {
    const details = await this.orderBookDetails()
    return details.spot_order_book_details.filter(
      (m) => m.status === MARKET_STATUS_ACTIVE
    )
  }

  async symbolToMarketId(): Promise<Map<string, number>> {
    const details = await this.orderBookDetails()
    const map = new Map<string, number>()
    for (const m of details.order_book_details) {
      map.set(m.symbol, m.market_id)
    }
    for (const m of details.spot_order_book_details) {
      map.set(m.symbol, m.market_id)
    }
    return map
  }

  async marketIdToSymbol(): Promise<Map<number, string>> {
    const details = await this.orderBookDetails()
    const map = new Map<number, string>()
    for (const m of details.order_book_details) {
      map.set(m.market_id, m.symbol)
    }
    for (const m of details.spot_order_book_details) {
      map.set(m.market_id, m.symbol)
    }
    return map
  }

  async assetIdToSymbol(): Promise<Map<number, string>> {
    const response = await this.assetDetails()
    return new Map(response.asset_details.map((a) => [a.asset_id, a.symbol]))
  }

  async tokenLogos(): Promise<Map<string, string>> {
    const response = await this.tokenList()
    return new Map(
      response.tokens.map(
        (t) =>
          [
            t.symbol,
            `${LIGHTER_LOGO_BASE_URL}/${t.logo}.${t.logo_extension}`,
          ] as const
      )
    )
  }

  async fundingRatesByMarket(): Promise<Map<number, number>> {
    const response = await this.fundingRates()
    return new Map(response.funding_rates.map((fr) => [fr.market_id, fr.rate]))
  }

  async resolveMarketId(symbol: string): Promise<number> {
    const lookup = await this.symbolToMarketId()
    const id = lookup.get(symbol)
    if (id === undefined) {
      throw new PerpsError(
        PerpsErrorCode.MarketNotFound,
        `Lighter market not found: ${symbol}`
      )
    }
    return id
  }
}

/** Lighter expresses margin fractions in 1/10000 — convert to whole-number leverage. */
export const marginFractionToMaxLeverage = (fraction: number): number => {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return 1
  }
  return Math.floor(10_000 / fraction)
}

/** Shared `provider` literal embedded in normalised payloads. */
export const PROVIDER_KEY = LIGHTER_PROVIDER_KEY
