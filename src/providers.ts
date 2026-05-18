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
 * One selectable value on a `Param` whose `values` are enumerated.
 *
 * `value` is the opaque per-provider identifier the SDK passes back to the
 * backend in the corresponding action params (e.g. the string assigned to
 * `mode` for `ACCOUNT_MODE`, or `tier` for `ACCOUNT_TYPE`).
 * `label` is the user-facing string the widget renders.
 */
export interface ParamOption {
  value: string
  label: string
}

/**
 * A single parameter the widget must collect from the user before
 * dispatching an action.
 *
 * `name` is the wire key the widget passes through to `execute()` — for the
 * existing `ACCOUNT_MODE` action that's `'mode'`, for `ACCOUNT_TYPE` it's
 * `'tier'`, etc. The widget builds the action's params object as
 * `{ [param.name]: <selected value> }` straight from the descriptor at
 * dispatch time; there is no per-ActionType translation layer.
 *
 * `type` describes the primitive shape of the value. Currently only
 * `'string'` is admitted — numeric / boolean primitives are deferred until
 * a real descriptor needs them (see ORD-290 § Out of Scope).
 *
 * `values` is present iff the parameter has a fixed enumeration of
 * admissible values (e.g. Hyperliquid abstraction modes, Lighter account
 * tiers). When absent the widget renders a free-form input appropriate to
 * the primitive `type`.
 *
 * `default` flags the suggested choice when `values` is provided. Must be
 * one of the entries in `values` if specified; consumers should fall back
 * to "no selection" when absent and let the user pick.
 *
 * `readOnly: true` means the widget must render the control disabled —
 * typically used when the provider exposes the current value but does not
 * allow the user to change it from this surface (e.g. Lighter account
 * mode, which is set during onboarding and immutable thereafter).
 */
export interface Param {
  name: string
  type: 'string'
  values?: ParamOption[]
  default?: ParamOption
  readOnly?: boolean
}

/**
 * Self-documenting descriptor for an account-level action the user may
 * (setup) or must (options) interact with. Extends `ActionDescriptor`
 * because each descriptor resolves to exactly one action the SDK
 * dispatches when the user proceeds; the additional fields are the
 * presentation and parameter-collection metadata the widget needs to
 * render the action without hardcoded per-ActionType branches.
 *
 * `params` is the list of parameters the widget must collect from the
 * user (zero-or-more); each entry tells the widget the wire key, the
 * primitive type, optional enumeration of admissible values, and
 * optional default. See `Param` for the field-level semantics.
 *
 * Categorisation of a descriptor as "setup" vs "options" is carried by
 * which array on `Provider` it appears in (`Provider.setup` vs
 * `Provider.options`), NOT by a field on the descriptor — by design.
 * `ProviderSetup` and `ProviderOption` are type aliases for this same
 * shape with no additional fields.
 */
export interface ProviderActionDescriptor extends ActionDescriptor {
  /** User-facing row title rendered in the setup / options modal. */
  title: string
  /** User-facing description rendered in the setup / options modal. */
  description: string
  /** Parameters the widget must collect before dispatching the action. */
  params: Param[]
}

/**
 * A descriptor that gates trading: the user MUST satisfy every entry on
 * `Provider.setup` before they can place orders with this provider. The
 * widget renders these in `<SetupModal />`, which auto-pops mid-session
 * whenever setup becomes unsatisfied (e.g. Hyperliquid agent expiry).
 *
 * Type alias for `ProviderActionDescriptor` — no additional fields. The
 * setup-vs-options distinction is the array, not a flag on the item.
 */
export type ProviderSetup = ProviderActionDescriptor

/**
 * A post-setup descriptor the user MAY interact with to tune provider
 * behaviour (e.g. switching Hyperliquid abstraction modes, switching
 * Lighter account tier). The widget renders these in `<OptionsModal />`
 * behind a cog icon; they never gate trading.
 *
 * Type alias for `ProviderActionDescriptor` — no additional fields. The
 * setup-vs-options distinction is the array, not a flag on the item.
 */
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
  /**
   * Mandatory account-setup descriptors. The user MUST satisfy every
   * entry before trading. The widget renders these in `<SetupModal />`,
   * which auto-pops whenever setup becomes unsatisfied. An empty array
   * is valid and indicates the provider has no setup gates.
   */
  setup: ProviderSetup[]
  /**
   * Optional post-setup descriptors the user may tune (account mode,
   * fee tier, etc.). Rendered in `<OptionsModal />` behind the cog icon;
   * never gates trading. An empty array is valid.
   */
  options: ProviderOption[]
  actions: ActionDescriptor[]
  markets: ProviderMarketInfo[]
  wsUrl?: string
  /**
   * Minimum deposit amount in USD that the provider's deposit path will
   * accept. Absent means no minimum is advertised — clients should not
   * gate the deposit UX on a value they don't have.
   */
  minDepositUsd?: number
}

export interface ProvidersResponse {
  providers: Provider[]
}
