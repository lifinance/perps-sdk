/**
 * Type-level fixtures for `Provider.setup` / `Provider.options` and the
 * shared `ProviderActionDescriptor` shape.
 *
 * `@lifi/perps-types` is types-only — the structural assertions below are
 * verified at typecheck time (`tsc --noEmit`). Vitest also picks the file up
 * via the `*.unit.spec.ts` glob, so a runtime structural regression fails
 * `pnpm test:unit`.
 */
import { describe, expect, it } from 'vitest'

import { ActionType, PerpsSigner, SigningMethod } from './enums.js'
import type {
  Param,
  ParamOption,
  Provider,
  ProviderActionDescriptor,
  ProviderOption,
  ProviderSetup,
} from './providers.js'
import type {
  AccountConfig,
  AccountConfigSetting,
  AccountConfigValue,
  AccountResponse,
  HyperliquidAccountConfig,
  LighterAccountConfig,
} from './account.js'

// ---------------------------------------------------------------------------
// Provider setup / options fixtures
// ---------------------------------------------------------------------------

// Hyperliquid: APPROVE_AGENT is a mandatory setup descriptor with no params —
// the widget renders a single sign-and-submit button.
const approveAgentSetup: ProviderSetup = {
  type: ActionType.APPROVE_AGENT,
  title: 'Approve agent wallet',
  description:
    'Lets the LI.FI session signer place orders on your behalf without further wallet prompts.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  params: [],
}

// Hyperliquid: APPROVE_BUILDER_FEE is mandatory — buildercodes are how LI.FI
// monetises the integration, so trading is gated until the user approves.
const approveBuilderFeeSetup: ProviderSetup = {
  type: ActionType.APPROVE_BUILDER_FEE,
  title: 'Approve builder fee',
  description:
    'Authorises the builder fee that funds LI.FI infrastructure for this provider.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  params: [],
}

// Lighter: REGISTER_API_KEY is the sole setup descriptor — once a session API
// key is registered, the WASM signer can produce signatures for the rest.
const registerApiKeySetup: ProviderSetup = {
  type: ActionType.REGISTER_API_KEY,
  title: 'Register session API key',
  description:
    'Registers a Lighter API key so the session signer can place orders.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
}

const dexAbstractionOption: ParamOption = {
  value: 'dexAbstraction',
  label: 'Dex abstraction',
}

// Hyperliquid: ACCOUNT_MODE is an options-tab descriptor — the user can toggle
// abstraction variants but trading is never blocked on the selection.
const hlAccountModeOption: ProviderOption = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description:
    'Choose how this account interacts with Hyperliquid. Defaults to dexAbstraction.',
  signers: [PerpsSigner.AGENT],
  signingMethod: SigningMethod.EIP712,
  params: [
    {
      name: 'mode',
      type: 'string',
      values: [
        { value: 'disabled', label: 'Standard' },
        dexAbstractionOption,
        { value: 'unifiedAccount', label: 'Unified account' },
      ],
      default: dexAbstractionOption,
    },
  ],
}

const lighterStandardTierOption: ParamOption = {
  value: 'standard',
  label: 'Standard',
}

// Lighter: ACCOUNT_TYPE — fee/latency tier selector. `readOnly: true`
// demonstrates the disabled-control branch (selection happens elsewhere).
const lighterAccountTypeOption: ProviderOption = {
  type: ActionType.ACCOUNT_TYPE,
  title: 'Account tier',
  description:
    'Premium tier reduces fees and improves matching priority on Lighter.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [
    {
      name: 'tier',
      type: 'string',
      values: [
        lighterStandardTierOption,
        { value: 'premium', label: 'Premium' },
      ],
      default: lighterStandardTierOption,
      readOnly: true,
    },
  ],
}

// Provider exercising both arrays with real-world entries: Hyperliquid has two
// setup gates and one tunable option.
const hyperliquidProvider: Provider = {
  key: 'hyperliquid',
  name: 'Hyperliquid',
  logoURI: 'https://example.invalid/hyperliquid.svg',
  signingMethod: SigningMethod.EIP712,
  active: true,
  setup: [approveAgentSetup, approveBuilderFeeSetup],
  options: [hlAccountModeOption],
  actions: [
    {
      type: ActionType.PLACE_ORDER,
      signers: [PerpsSigner.AGENT],
      signingMethod: SigningMethod.EIP712,
    },
  ],
  markets: [{ id: 'BTC-PERP', quoteAsset: 'USDC' }],
}

// Provider exercising the Lighter mapping: one setup gate, two options.
const lighterProvider: Provider = {
  key: 'lighter',
  name: 'Lighter',
  logoURI: 'https://example.invalid/lighter.svg',
  signingMethod: SigningMethod.WASM_BLOB,
  active: true,
  setup: [registerApiKeySetup],
  options: [lighterAccountTypeOption],
  actions: [
    {
      type: ActionType.PLACE_ORDER,
      signers: [PerpsSigner.API_KEY],
      signingMethod: SigningMethod.WASM_BLOB,
    },
  ],
  markets: [{ id: 'BTC', quoteAsset: 'USDC' }],
}

// Empty setup + options is valid (provider with no gates and no knobs).
const providerWithNoDescriptors: Provider = {
  key: 'noop',
  name: 'No-op',
  logoURI: 'https://example.invalid/noop.svg',
  signingMethod: SigningMethod.EVM_TX,
  active: true,
  setup: [],
  options: [],
  actions: [],
  markets: [],
}

// Announced-but-not-launched provider — `active: false` greys it out.
const announcedProvider: Provider = {
  key: 'announced',
  name: 'Announced',
  logoURI: 'https://example.invalid/announced.svg',
  signingMethod: SigningMethod.EIP712,
  active: false,
  setup: [],
  options: [],
  actions: [],
  markets: [],
}

// ---------------------------------------------------------------------------
// AccountConfig fixtures — discriminated union narrows on `provider`
// ---------------------------------------------------------------------------

const hyperliquidConfig: HyperliquidAccountConfig = {
  provider: 'hyperliquid',
  abstractionMode: 'dexAbstraction',
  agents: [],
  builderFeeApproval: {
    builderAddress: '0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef',
    maxFeeRate: '50',
    approved: true,
  },
}

// abstractionMode: null is valid (account has never had abstraction set).
const hyperliquidConfigUnset: HyperliquidAccountConfig = {
  provider: 'hyperliquid',
  abstractionMode: null,
  agents: [{ address: '0xabc', validUntil: 123 }],
}

const lighterConfig: LighterAccountConfig = {
  provider: 'lighter',
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyRegistered: true,
  accountType: 0,
}

const hyperliquidAccountResponse: AccountResponse = {
  provider: 'hyperliquid',
  address: '0x0000000000000000000000000000000000000001',
  balances: { hyperliquid: [{ currency: 'USDC', amount: '100' }] },
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  config: hyperliquidConfig,
}

const lighterAccountResponse: AccountResponse = {
  provider: 'lighter',
  address: '0x0000000000000000000000000000000000000002',
  balances: { lighter: [{ currency: 'USDC', amount: '50' }] },
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0', taker: '0' },
  config: lighterConfig,
}

// SDK projection: one setting per descriptor on the relevant provider array.
const hyperliquidModeSetting: AccountConfigSetting = {
  type: ActionType.ACCOUNT_MODE,
  values: [{ name: 'mode', value: 'dexAbstraction' }],
}

const lighterTypeSetting: AccountConfigSetting = {
  type: ActionType.ACCOUNT_TYPE,
  values: [{ name: 'tier', value: 0 }],
}

// AccountConfigValue covers the four primitive shapes the descriptor may emit.
const stringValue: AccountConfigValue = { name: 'mode', value: 'standard' }
const numberValue: AccountConfigValue = { name: 'tier', value: 1 }
const booleanValue: AccountConfigValue = { name: 'approved', value: true }
const nullValue: AccountConfigValue = { name: 'mode', value: null }

// ---------------------------------------------------------------------------
// Compile-time assertions
// ---------------------------------------------------------------------------

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// `Provider.setup` and `Provider.options` are exactly the descriptor arrays.
type _SetupFieldShape = Expect<Equals<Provider['setup'], ProviderSetup[]>>
type _OptionsFieldShape = Expect<Equals<Provider['options'], ProviderOption[]>>

// `ProviderSetup` and `ProviderOption` are aliases for the same shape —
// no category-specific fields. Categorisation lives in the array, not the item.
type _SetupIsDescriptor = Expect<
  Equals<ProviderSetup, ProviderActionDescriptor>
>
type _OptionIsDescriptor = Expect<
  Equals<ProviderOption, ProviderActionDescriptor>
>
type _SetupEqualsOption = Expect<Equals<ProviderSetup, ProviderOption>>

// Both arrays are required on `Provider` — no implicit empty fallback.
type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K
}[keyof T]
type _SetupIsRequired = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'setup'>, 'setup'>
>
type _OptionsIsRequired = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'options'>, 'options'>
>

// `ProviderActionDescriptor` keys: the three ActionDescriptor fields plus the
// three presentation fields. Catches an accidental rename / addition.
type _DescriptorKeys = Expect<
  Equals<
    keyof ProviderActionDescriptor,
    'type' | 'signers' | 'signingMethod' | 'title' | 'description' | 'params'
  >
>

// `Param.type` is the literal `'string'` — numeric / boolean primitives
// are deferred until a real descriptor needs them.
type _ParamTypeIsString = Expect<Equals<Param['type'], 'string'>>

// `AccountConfig` narrows on `provider`. The widget never reads the union
// directly without narrowing — these assertions lock that contract.
type _NarrowHl = Expect<
  Equals<
    Extract<AccountConfig, { provider: 'hyperliquid' }>,
    HyperliquidAccountConfig
  >
>
type _NarrowLighter = Expect<
  Equals<Extract<AccountConfig, { provider: 'lighter' }>, LighterAccountConfig>
>

// `AccountResponse.config` is the discriminated union — NOT
// `Record<string, unknown>`. There is no untyped escape hatch.
type _AccountResponseConfig = Expect<
  Equals<AccountResponse['config'], AccountConfig>
>

// `AccountConfigValue.value` admits the four documented primitive shapes.
type _AccountConfigValueShape = Expect<
  Equals<AccountConfigValue['value'], string | number | boolean | null>
>

// Re-export the fixtures so noUnusedLocals doesn't flag them. Consumers MUST
// NOT depend on these — the file is excluded from the published build.
export const _fixtures = {
  approveAgentSetup,
  approveBuilderFeeSetup,
  registerApiKeySetup,
  hlAccountModeOption,
  lighterAccountTypeOption,
  hyperliquidProvider,
  lighterProvider,
  providerWithNoDescriptors,
  announcedProvider,
  hyperliquidConfig,
  hyperliquidConfigUnset,
  lighterConfig,
  hyperliquidAccountResponse,
  lighterAccountResponse,
  hyperliquidModeSetting,
  lighterTypeSetting,
  stringValue,
  numberValue,
  booleanValue,
  nullValue,
}

export type _TypeAssertions = [
  _SetupFieldShape,
  _OptionsFieldShape,
  _SetupIsDescriptor,
  _OptionIsDescriptor,
  _SetupEqualsOption,
  _SetupIsRequired,
  _OptionsIsRequired,
  _DescriptorKeys,
  _ParamTypeIsString,
  _NarrowHl,
  _NarrowLighter,
  _AccountResponseConfig,
  _AccountConfigValueShape,
]

// ---------------------------------------------------------------------------
// Runtime assertions — verify the fixtures are structurally consistent so the
// `.unit.spec.ts` glob's runtime pass catches regressions too (not just tsc).
// ---------------------------------------------------------------------------

describe('Provider setup / options descriptors', () => {
  it('hyperliquid setup gates trading on agent + builder fee approval', () => {
    expect(hyperliquidProvider.setup.map((d) => d.type)).toEqual([
      ActionType.APPROVE_AGENT,
      ActionType.APPROVE_BUILDER_FEE,
    ])
  })

  it('hyperliquid options expose the ACCOUNT_MODE descriptor only', () => {
    expect(hyperliquidProvider.options.map((d) => d.type)).toEqual([
      ActionType.ACCOUNT_MODE,
    ])
  })

  it('lighter setup gates trading on API key registration only', () => {
    expect(lighterProvider.setup.map((d) => d.type)).toEqual([
      ActionType.REGISTER_API_KEY,
    ])
  })

  it('hl ACCOUNT_MODE param wires the descriptor through to AccountModeParams.mode', () => {
    const param = hlAccountModeOption.params[0]
    expect(param.name).toBe('mode')
    expect(param.default?.value).toBe('dexAbstraction')
    expect(param.values?.map((o) => o.value)).toEqual([
      'disabled',
      'dexAbstraction',
      'unifiedAccount',
    ])
  })

  it('lighter ACCOUNT_TYPE param wires through to AccountTypeParams.tier and is read-only', () => {
    const param = lighterProvider.options[0].params[0]
    expect(param.name).toBe('tier')
    expect(param.readOnly).toBe(true)
    expect(param.values?.map((o) => o.value)).toEqual(['standard', 'premium'])
  })

  it('admits providers with empty setup and options arrays', () => {
    expect(providerWithNoDescriptors.setup).toEqual([])
    expect(providerWithNoDescriptors.options).toEqual([])
  })
})

describe('AccountConfig discriminated union', () => {
  it('narrows to HyperliquidAccountConfig on provider === "hyperliquid"', () => {
    const config: AccountConfig = hyperliquidConfig
    if (config.provider === 'hyperliquid') {
      expect(config.abstractionMode).toBe('dexAbstraction')
      expect(config.builderFeeApproval?.approved).toBe(true)
    } else {
      throw new Error('expected hyperliquid variant')
    }
  })

  it('narrows to LighterAccountConfig on provider === "lighter"', () => {
    const config: AccountConfig = lighterConfig
    if (config.provider === 'lighter') {
      expect(config.accountIndex).toBe(42)
      expect(config.apiKeyRegistered).toBe(true)
    } else {
      throw new Error('expected lighter variant')
    }
  })

  it('admits abstractionMode: null (account never had abstraction set)', () => {
    expect(hyperliquidConfigUnset.abstractionMode).toBeNull()
  })

  it('admits builderFeeApproval being absent (no builder configured)', () => {
    expect(hyperliquidConfigUnset.builderFeeApproval).toBeUndefined()
  })

  it('exhaustively narrows in a switch — adding a variant breaks the build', () => {
    const summarise = (config: AccountConfig): string => {
      switch (config.provider) {
        case 'hyperliquid':
          return `hl:${config.abstractionMode}:${config.agents.length}`
        case 'lighter':
          return `lt:${config.accountIndex}:${config.accountType}`
        default: {
          const _exhaustive: never = config
          return _exhaustive
        }
      }
    }
    expect(summarise(hyperliquidConfig)).toBe('hl:dexAbstraction:0')
    expect(summarise(lighterConfig)).toBe('lt:42:0')
  })
})

describe('AccountResponse.config', () => {
  it('carries the discriminated HyperliquidAccountConfig', () => {
    expect(hyperliquidAccountResponse.config.provider).toBe('hyperliquid')
  })

  it('carries the discriminated LighterAccountConfig', () => {
    expect(lighterAccountResponse.config.provider).toBe('lighter')
  })
})

describe('AccountConfigSetting / AccountConfigValue', () => {
  it('binds a setting to its descriptor by ActionType + Param.name', () => {
    expect(hyperliquidModeSetting.type).toBe(ActionType.ACCOUNT_MODE)
    expect(hyperliquidModeSetting.values[0].name).toBe('mode')
    expect(hyperliquidModeSetting.values[0].value).toBe('dexAbstraction')
  })

  it('admits the four primitive value shapes the descriptor may emit', () => {
    expect(stringValue.value).toBe('standard')
    expect(numberValue.value).toBe(1)
    expect(booleanValue.value).toBe(true)
    expect(nullValue.value).toBeNull()
  })

  it('surfaces Lighter accountType as a number (raw integer tier)', () => {
    expect(lighterTypeSetting.values[0].value).toBe(0)
  })
})
