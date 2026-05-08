/**
 * Type-level fixture for `AccountConfigurationItem` and
 * `Provider.accountConfiguration`.
 *
 * `@lifi/perps-types` is a types-only package: there is no runtime test
 * runner here, so this spec verifies the contract via `tsc --noEmit`
 * (`pnpm typecheck`). A failed structural check turns into a typecheck
 * error, which is what the AC means by "round-trips through the type
 * without errors and the new field is present".
 *
 * If/when vitest is introduced to this repo (tracked separately), the same
 * fixture below can be wrapped in a `describe`/`expect` block without
 * changing its substance.
 */
import { ActionType, PerpsSigner, SigningMethod } from './enums.js'
import type {
  AccountConfigurationControl,
  AccountConfigurationItem,
  ActionDescriptor,
  Provider,
} from './providers.js'

// Fixture: a required AccountConfigurationItem covering every field on the type.
const approveAgentItem: AccountConfigurationItem = {
  type: ActionType.APPROVE_AGENT,
  title: 'Approve agent wallet',
  description:
    'Lets the LI.FI session signer place orders on your behalf without further wallet prompts.',
  optional: false,
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  control: { type: 'user-approval' },
}

// Fixture: a second required item, exercising the array-of-multiple case.
const approveBuilderFeeItem: AccountConfigurationItem = {
  type: ActionType.APPROVE_BUILDER_FEE,
  title: 'Approve builder fee',
  description:
    'Authorises the builder fee that funds LI.FI infrastructure for this provider.',
  optional: false,
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  control: { type: 'user-approval' },
}

// Fixture: a register-api-key item — Lighter's third user-approval entry.
const registerApiKeyItem: AccountConfigurationItem = {
  type: ActionType.REGISTER_API_KEY,
  title: 'Register session API key',
  description:
    'Registers a Lighter API key so the session signer can place orders.',
  optional: false,
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  control: { type: 'user-approval' },
}

// Fixture: an ACCOUNT_MODE multi-option item — the HL abstraction selector.
// The user-facing label is provider-agnostic; the values are the opaque
// per-provider identifiers the backend resolves to its wire enum.
const hlAccountModeItem: AccountConfigurationItem = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description:
    'Choose how this account interacts with Hyperliquid. Defaults to dexAbstraction.',
  optional: true,
  signers: [PerpsSigner.AGENT],
  signingMethod: SigningMethod.EIP712,
  control: {
    type: 'multi-option',
    values: [
      { value: 'disabled', label: 'Standard' },
      { value: 'dexAbstraction', label: 'Dex abstraction', default: true },
      { value: 'unifiedAccount', label: 'Unified account' },
    ],
  },
}

// Fixture: a Lighter ACCOUNT_TYPE multi-option item using `readOnly: true`.
// Demonstrates the disabled-control branch — the descriptor surfaces the
// account's tier but the widget renders the control inert (e.g. because
// upgrade requires going through Lighter's UI directly).
const lighterAccountTypeItem: AccountConfigurationItem = {
  type: ActionType.ACCOUNT_TYPE,
  title: 'Account tier',
  description:
    'Premium tier reduces fees and improves matching priority on Lighter.',
  optional: true,
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  control: {
    type: 'multi-option',
    values: [
      { value: 'standard', label: 'Standard', default: true },
      { value: 'premium', label: 'Premium' },
    ],
    readOnly: true,
  },
}

// Fixture: a Provider exercising `accountConfiguration` with both required
// and optional entries, mixing user-approval and multi-option controls.
const providerFixture: Provider = {
  key: 'hyperliquid',
  name: 'Hyperliquid',
  logoURI: 'https://example.invalid/hyperliquid.svg',
  signingMethod: SigningMethod.EIP712,
  active: true,
  accountConfiguration: [
    approveAgentItem,
    approveBuilderFeeItem,
    hlAccountModeItem,
  ],
  actions: [
    {
      type: ActionType.PLACE_ORDER,
      signers: [PerpsSigner.AGENT],
      signingMethod: SigningMethod.EIP712,
    },
  ],
  markets: [{ id: 'BTC-PERP', quoteAsset: 'USDC' }],
}

// Fixture: empty `accountConfiguration` is valid (provider with no setup gates).
const providerWithNoConfigurationFixture: Provider = {
  key: 'noop',
  name: 'No-op',
  logoURI: 'https://example.invalid/noop.svg',
  signingMethod: SigningMethod.EVM_TX,
  active: true,
  accountConfiguration: [],
  actions: [],
  markets: [],
}

// Fixture: announced-but-not-yet-launched provider (`active: false`) — the
// widget greys these out with a "Coming Soon" subtitle, but they still
// round-trip through the type without any other field changes.
const announcedProviderFixture: Provider = {
  key: 'announced',
  name: 'Announced',
  logoURI: 'https://example.invalid/announced.svg',
  signingMethod: SigningMethod.EIP712,
  active: false,
  accountConfiguration: [],
  actions: [],
  markets: [],
}

// Compile-time assertion helper: errors at typecheck time if `T` is not `true`.
type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// `Provider['accountConfiguration']` is exactly `AccountConfigurationItem[]`.
type _AccountConfigurationFieldShape = Expect<
  Equals<Provider['accountConfiguration'], AccountConfigurationItem[]>
>

// `accountConfiguration` is a required key on `Provider` (not optional).
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]
type _AccountConfigurationIsRequired = Expect<
  Equals<
    Extract<RequiredKeys<Provider>, 'accountConfiguration'>,
    'accountConfiguration'
  >
>

// `Provider.active` is exactly `boolean` (catches accidental widening to
// `boolean | undefined` or narrowing to a literal).
type _ActiveFieldShape = Expect<Equals<Provider['active'], boolean>>

// `active` is a required key on `Provider` (not optional). The backend MUST
// declare every provider's launch state explicitly.
type _ActiveIsRequired = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'active'>, 'active'>
>

// `AccountConfigurationItem` is `ActionDescriptor` plus the four metadata
// fields (title / description / optional / control). Catches accidental
// optional-marker drift or rename of any field on either type.
type _AccountConfigurationItemKeys = Expect<
  Equals<
    keyof AccountConfigurationItem,
    keyof ActionDescriptor | 'title' | 'description' | 'optional' | 'control'
  >
>

// `control` is a required key on `AccountConfigurationItem`. Backends MUST
// tag every item; the widget can't fall back to a default render because
// the control type changes the component, not just its props.
type _ControlIsRequired = Expect<
  Equals<Extract<RequiredKeys<AccountConfigurationItem>, 'control'>, 'control'>
>

// Each AccountConfigurationItem is assignable to ActionDescriptor (the SDK relies
// on this — it dispatches the underlying action step from the operational fields).
type _IsActionDescriptorSuperset = Expect<
  Equals<AccountConfigurationItem extends ActionDescriptor ? true : false, true>
>

// The discriminator narrows on `type` without runtime checks. Both branches
// are reachable; narrowing to `'multi-option'` exposes `values` and (optionally)
// `readOnly`; narrowing to `'user-approval'` does NOT expose those fields.
type _UserApprovalNarrows = Expect<
  Equals<
    Extract<AccountConfigurationControl, { type: 'user-approval' }>,
    { type: 'user-approval' }
  >
>

type _MultiOptionNarrows = Expect<
  Equals<
    Extract<AccountConfigurationControl, { type: 'multi-option' }>['values'],
    ReadonlyArray<{ value: string; label: string; default?: boolean }>
  >
>

// Compile-time assertion that the multi-option branch's `readOnly` field
// is optional. Treating it as required would force every Hyperliquid
// descriptor to set `readOnly: false` explicitly even when the control
// is editable — a needless ceremony the AC explicitly rejects.
const _editableMultiOption: AccountConfigurationControl = {
  type: 'multi-option',
  values: [{ value: 'a', label: 'A' }],
}
void _editableMultiOption

// Re-export the fixtures so the file is not flagged as an unused-locals island
// by the project's strict `noUnusedLocals` rule. Consumers MUST NOT depend on
// these — the file is excluded from the published build via
// `tsconfig.build.json` and the `files` glob in `package.json`.
export const _fixtures = {
  approveAgentItem,
  approveBuilderFeeItem,
  registerApiKeyItem,
  hlAccountModeItem,
  lighterAccountTypeItem,
  providerFixture,
  providerWithNoConfigurationFixture,
  announcedProviderFixture,
}

export type _TypeAssertions = [
  _AccountConfigurationFieldShape,
  _AccountConfigurationIsRequired,
  _ActiveFieldShape,
  _ActiveIsRequired,
  _AccountConfigurationItemKeys,
  _ControlIsRequired,
  _IsActionDescriptorSuperset,
  _UserApprovalNarrows,
  _MultiOptionNarrows,
]
