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
}

// Fixture: a genuinely optional item — the widget and backend operate
// regardless of which abstraction mode the user is in (portfolioMargin is
// out of scope), so the user may proceed without enabling agent-managed
// abstraction.
const agentSetAbstractionItem: AccountConfigurationItem = {
  type: ActionType.AGENT_SET_ABSTRACTION,
  title: 'Enable agent-managed abstraction',
  description:
    'Lets the LI.FI session signer manage abstraction settings without an additional wallet prompt each time.',
  optional: true,
  signers: [PerpsSigner.AGENT],
  signingMethod: SigningMethod.EIP712,
}

// Fixture: a Provider exercising `accountConfiguration` with both required
// and optional entries.
const providerFixture: Provider = {
  key: 'hyperliquid',
  name: 'Hyperliquid',
  logoURI: 'https://example.invalid/hyperliquid.svg',
  signingMethod: SigningMethod.EIP712,
  active: true,
  accountConfiguration: [
    approveAgentItem,
    approveBuilderFeeItem,
    agentSetAbstractionItem,
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

// `AccountConfigurationItem` is `ActionDescriptor` plus the three metadata fields.
// Catches accidental optional-marker drift or rename of any field on either type.
type _AccountConfigurationItemKeys = Expect<
  Equals<
    keyof AccountConfigurationItem,
    keyof ActionDescriptor | 'title' | 'description' | 'optional'
  >
>

// Each AccountConfigurationItem is assignable to ActionDescriptor (the SDK relies
// on this — it dispatches the underlying action step from the operational fields).
type _IsActionDescriptorSuperset = Expect<
  Equals<AccountConfigurationItem extends ActionDescriptor ? true : false, true>
>

// Re-export the fixtures so the file is not flagged as an unused-locals island
// by the project's strict `noUnusedLocals` rule. Consumers MUST NOT depend on
// these — the file is excluded from the published build via
// `tsconfig.build.json` and the `files` glob in `package.json`.
export const _fixtures = {
  approveAgentItem,
  approveBuilderFeeItem,
  agentSetAbstractionItem,
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
  _IsActionDescriptorSuperset,
]
