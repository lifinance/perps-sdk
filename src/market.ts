export interface AuthorizationParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  required: boolean
}

export interface Authorization {
  key: string
  name: string
  params?: AuthorizationParam[]
}

export interface Dex {
  key: string
  name: string
  logoURI: string
  authorizations: Authorization[]
  extraData?: Record<string, unknown>
}

export interface DexesResponse {
  dexes: Dex[]
}

export interface FundingInfo {
  rate: string
  nextFundingTime: number
}

export interface Market {
  symbol: string
  name: string
  logoURI: string
  assetId: number
  dex: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
  funding: FundingInfo
  openInterest?: string
  volume24h?: string
  markPrice: string
}

export interface MarketsResponse {
  markets: Market[]
}

export interface PricesResponse {
  prices: Record<string, string>
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
  dex: string
  symbol: string
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
  dex: string
  symbol: string
  bids: OrderbookLevel[]
  asks: OrderbookLevel[]
  timestamp: number
}
