export interface Token {
  id: string // provider-agnostic identity; Lighter's numeric asset_id is stringified at the backend boundary
  symbol: string
  logoURI?: string
}

export interface TokensResponse {
  tokens: Token[]
}
