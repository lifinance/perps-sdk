import type { ActionType, PerpsSigner, SigningMethod } from './enums.js'

export interface ActionDescriptor {
  type: ActionType
  signers: PerpsSigner[]
}

export interface ProviderMarketInfo {
  id: string
  quoteAsset: string | null
}

export interface Provider {
  key: string
  name: string
  logoURI: string
  signingMethod: SigningMethod
  prepareAccountActions: ActionDescriptor[]
  actions: ActionDescriptor[]
  markets: ProviderMarketInfo[]
  wsUrl?: string
}

export interface ProvidersResponse {
  providers: Provider[]
}
