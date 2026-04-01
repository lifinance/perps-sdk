export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

export interface AssetIdentity {
  assetId: string // provider's canonical identity: "BTC", "xyz:PURR", "@142"
  market: string // market category from /providers.markets: "hyperliquid", "xyz", "spot"
  displaySymbol: string // UI pair name: "BTC/USDC", "PURR/USDH"
  displayName?: string // future: "Bitcoin", "Ethereum"
}

export interface Asset extends AssetIdentity {
  logoURI: string
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
  assetId: string
  price: string
}

export interface AssetsResponse {
  assets: Asset[]
}

export interface PricesResponse {
  prices: AssetPrice[]
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
  assetId: string
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
  assetId: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}
