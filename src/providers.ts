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

/**
 * Self-documenting account-setup step the user must (or may) fulfill before
 * trading with a given provider. Mirrors a single entry of the `config`
 * object returned by `GET /perps/account` — that endpoint reports the
 * *state* of these items, while `Provider.accountConfiguration` declares
 * what items exist and how to fulfill them.
 *
 * Extends `ActionDescriptor` because each item resolves to exactly one
 * action the SDK dispatches when the user proceeds; the additional fields
 * are the presentation and gating metadata the widget needs to render the
 * onboarding overlay without hardcoded labels.
 *
 * `optional: false` means the item must be fulfilled before the user can
 * proceed; `optional: true` means the user may skip it.
 */
export interface AccountConfigurationItem extends ActionDescriptor {
  /** User-facing row title rendered in the onboarding overlay. */
  title: string
  /** User-facing description rendered in the onboarding overlay. */
  description: string
  /** When true the user may skip the item; when false it gates the trade flow. */
  optional: boolean
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
  /**
   * Account-setup items required (or optional) for trading with this
   * provider. Replaces the previous `prepareAccountActions: ActionDescriptor[]`:
   * same operational fields, plus the user-facing metadata the widget needs.
   * An empty array is valid and indicates the provider has no setup gates.
   */
  accountConfiguration: AccountConfigurationItem[]
  actions: ActionDescriptor[]
  markets: ProviderMarketInfo[]
  wsUrl?: string
}

export interface ProvidersResponse {
  providers: Provider[]
}
