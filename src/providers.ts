import type { ActionType, PerpsSigner, SigningMethod } from './enums.js'

export interface ActionDescriptor {
  type: ActionType
  signers: PerpsSigner[]
  /**
   * How the SDK must sign this specific action. Most actions match the
   * provider's dominant pattern (Hyperliquid: EIP712, Lighter: WASM_BLOB),
   * but on-chain bridge actions like DEPOSIT are EVM_TX regardless of
   * provider — the SDK dispatches by this field rather than by
   * `Provider.signingMethod`.
   */
  signingMethod: SigningMethod
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
