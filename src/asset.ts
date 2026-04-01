export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

export interface AssetIdentity {
  assetId: string // provider's canonical identity: "BTC", "xyz:PURR", "@142"
  market: string // market category from /providers.markets: "hyperliquid", "xyz", "spot"
}

export interface Asset extends AssetIdentity {
  displaySymbol: string // UI base name: "BTC", "PURR"; spot keeps full pair: "PURR/USDC"
  displayQuote: string | null // quote asset for perps: "USDC", "USDH"; null for spot
  displayName?: string // future: "Bitcoin", "Ethereum"
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

export type AssetDisplay = Pick<
  Asset,
  'assetId' | 'market' | 'displaySymbol' | 'displayQuote'
>

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
