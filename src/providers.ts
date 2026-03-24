import type { ActionType, PerpsSigner } from './enums.js'

export interface ActionDescriptor {
  type: ActionType
  signers: PerpsSigner[]
}

export interface Provider {
  key: string
  name: string
  logoURI: string
  prepareAccountActions: ActionDescriptor[]
  actions: ActionDescriptor[]
  extraData?: Record<string, unknown>
  wsUrl?: string
}

export interface ProvidersResponse {
  providers: Provider[]
}
