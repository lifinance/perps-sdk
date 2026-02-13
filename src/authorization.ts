import type { Address, Hex, PerpsTypedData } from './typedData.js'

export interface AuthorizationInput {
  key: string
  params?: Record<string, unknown>
}

export interface CreateAuthorizationRequest {
  dex: string
  address: Address
  signerAddress?: Address
  authorizations: AuthorizationInput[]
}

export interface AuthorizationAction {
  action: string
  description?: string
  typedData: PerpsTypedData
}

export interface CreateAuthorizationResponse {
  actions: AuthorizationAction[]
}

export interface SignedAuthorization {
  action: string
  typedData: PerpsTypedData
  signature: Hex
}

export interface AuthorizationsRequest {
  dex: string
  address: Address
  signerAddress?: Address
  actions: SignedAuthorization[]
}

export interface AuthorizationResult {
  action: string
  success: boolean
  error?: string
}

export interface AuthorizationsResponse {
  results: AuthorizationResult[]
}
