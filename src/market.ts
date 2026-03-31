export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

export interface Asset {
  symbol: string
  providerAssetId: string
  name: string
  logoURI: string
  provider: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
  funding: FundingInfo
  openInterest?: string
  volume24h?: string
  prevDayPrice?: string
  markPrice: string
}

export interface AssetPrice {
  providerAssetId: string
  price: string
}

/** Generic grouping keyed by providerMarketId */
export type ProviderMarketGroup<T> = Record<string, T>

export interface AssetsResponse {
  assets: ProviderMarketGroup<Asset[]>
}

export interface PricesResponse {
  prices: ProviderMarketGroup<AssetPrice[]>
}

export interface Candle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}

export interface OhlcvResponse {
  provider: string
  providerAssetId: string
  interval: string
  candles: Candle[]
}

export type OhlcvInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M'

export interface OrderbookLevel {
  price: string
  size: string
}

export interface OrderbookResponse {
  provider: string
  providerAssetId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}
