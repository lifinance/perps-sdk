import type { ActionType, PerpsSigner, SigningMethod } from './enums.js'

export interface ActionDescriptor {
  type: ActionType
  signers: PerpsSigner[]
  signingMethod: SigningMethod
}

export interface ParamOption {
  value: string
  label: string
}

export interface Param {
  /** Wire key for the action params object: `{ [param.name]: value }`. */
  name: string
  type: 'string'
  /** Present iff the parameter has a fixed enumeration of admissible values. */
  values?: ParamOption[]
  default?: ParamOption
  readOnly?: boolean
}

export interface ProviderActionDescriptor extends ActionDescriptor {
  title: string
  description: string
  params: Param[]
}

export type ProviderSetup = ProviderActionDescriptor

export type ProviderOption = ProviderActionDescriptor

export interface ProviderMarketInfo {
  id: string
  quoteAsset: string | null
}

export interface Provider {
  key: string
  name: string
  logoURI: string
  signingMethod: SigningMethod
  /** When false, the provider is announced but not yet selectable in clients. */
  active: boolean
  setup: ProviderSetup[]
  options: ProviderOption[]
  actions: ActionDescriptor[]
  markets: ProviderMarketInfo[]
  wsUrl?: string
  /** Absent means no minimum advertised. */
  minDepositUsd?: number
}

export interface ProvidersResponse {
  providers: Provider[]
}
