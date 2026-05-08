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
 * One selectable value on a `multi-option` account configuration control.
 *
 * `value` is the opaque per-provider identifier the SDK passes back to the
 * backend in the corresponding `ACCOUNT_MODE` / `ACCOUNT_TYPE` action params.
 * `label` is the user-facing string the widget renders. `default: true` flags
 * the suggested choice for new accounts — there should be at most one default
 * per descriptor.
 */
export interface AccountConfigurationOption {
  value: string
  label: string
  default?: boolean
}

/**
 * Discriminator describing how the widget renders the control associated
 * with an `AccountConfigurationItem`.
 *
 * - `user-approval` — single user signature (e.g. `APPROVE_AGENT`,
 *   `APPROVE_BUILDER_FEE`, `REGISTER_API_KEY`). The widget renders a
 *   button; the descriptor carries no extra metadata.
 * - `multi-option` — a fixed set of mutually-exclusive choices (e.g.
 *   account mode, account type tier). The widget renders a select-style
 *   control populated from `values`; the current selection comes from
 *   account state (`GET /perps/account`), not from the descriptor.
 *   `readOnly: true` means the control is rendered disabled — typically
 *   used when the provider exposes the value but does not allow the user
 *   to change it from this surface.
 *
 * Always discriminated on the literal `type` field, so consumers narrow
 * without runtime checks.
 */
export type AccountConfigurationControl =
  | { type: 'user-approval' }
  | {
      type: 'multi-option'
      values: ReadonlyArray<AccountConfigurationOption>
      readOnly?: boolean
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
 *
 * `control` tells the widget which control component to render — a button
 * (`user-approval`) or a multi-option selector (`multi-option`). All
 * existing items (`APPROVE_AGENT`, `APPROVE_BUILDER_FEE`, etc.) are
 * `user-approval`; the new generic `ACCOUNT_MODE` / `ACCOUNT_TYPE` items
 * are `multi-option`. Backends tag the discriminator at construction time.
 */
export interface AccountConfigurationItem extends ActionDescriptor {
  /** User-facing row title rendered in the onboarding overlay. */
  title: string
  /** User-facing description rendered in the onboarding overlay. */
  description: string
  /** When true the user may skip the item; when false it gates the trade flow. */
  optional: boolean
  /** Control-type discriminator; see `AccountConfigurationControl`. */
  control: AccountConfigurationControl
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
  /** When false, the provider is announced but not yet selectable in clients. */
  active: boolean
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
