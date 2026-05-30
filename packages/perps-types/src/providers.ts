import type { ActionType, PerpsSigner, SigningMethod } from './enums.js'

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

/**
 * A single provider action. The same shape backs `Provider.setup`,
 * `Provider.options`, and `Provider.actions` — categorisation lives in which
 * array it sits in, not in the type. The core three fields are always present;
 * the rest are presentation/ordering hints provided per-action in the
 * provider's hardcoded metadata.
 */
export interface ProviderAction {
  type: ActionType
  signers: PerpsSigner[]
  signingMethod: SigningMethod
  /**
   * Human label. Drives the card heading in the setup/options modals, and may
   * also front an in-flight trading action ("{title} is working…").
   */
  title?: string
  description?: string
  /** UI form fields the widget renders to collect input for this action. */
  params?: Param[]
  /**
   * Ascending order in which the user satisfies setup steps. Cloud-init
   * convention: 10, 20, 30, … with 99 reserved for "always last"; the gaps
   * leave room to insert steps later without renumbering. Lower runs first;
   * a step may depend on every lower-sequenced step already being satisfied.
   */
  sequence?: number
}

/**
 * Provider-attached advisory shown against a market. Provider-agnostic: the
 * producer decides when to emit one (e.g. an HL HIP-3 sub-dex risk warning).
 */
export interface TradeNotice {
  /** Maps to the widget's panel styling: `warn` → warning, `info` → info. */
  level: 'info' | 'warn'
  /** Plaintext; any URL is rendered as text, not a hyperlink. */
  message: string
}

export interface ProviderMarketInfo {
  id: string
  quoteAsset: string | null
  tradeNotice?: TradeNotice
}

export interface Provider {
  key: string
  name: string
  logoURI: string
  signingMethod: SigningMethod
  /** When false, the provider is announced but not yet selectable in clients. */
  active: boolean
  setup: ProviderAction[]
  options: ProviderAction[]
  actions: ProviderAction[]
  markets: ProviderMarketInfo[]
  wsUrl?: string
  /** Absent means no minimum advertised. */
  minDepositUsd?: number
}

export interface ProvidersResponse {
  providers: Provider[]
}
