import { describe, expect, it } from 'vitest'
import type {
  AccountConfig,
  AccountConfigSetting,
  AccountConfigValue,
  AccountResponse,
  HyperliquidAccountConfig,
  LighterAccountConfig,
} from './account.js'
import type { Asset, DepositAsset } from './asset.js'
import { ActionType, PerpsSigner, SigningMethod } from './enums.js'
import type { ProviderFunding as ExportedProviderFunding } from './index.js'
import type { MarketContext, OhlcvInterval } from './market.js'
import type {
  Param,
  ParamOption,
  Provider,
  ProviderAction,
  ProviderCategory,
  ProviderFunding,
  TradeNotice,
} from './providers.js'

const hourlyProviderFunding: ProviderFunding = {
  ratePeriodSeconds: 60 * 60,
  payoutCadenceSeconds: 60 * 60,
}

const usdcAsset: Asset = {
  providerId: 'hyperliquid',
  id: 'USDC',
  displaySymbol: 'USDC',
  logoURI: 'https://example.invalid/usdc.svg',
}

const arbitrumUsdcDeposit: DepositAsset = {
  chainId: 42161,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  decimals: 6,
  displaySymbol: 'USDC',
  logoURI: 'https://example.invalid/usdc.svg',
}

// ---------------------------------------------------------------------------
// Provider setup / options fixtures
// ---------------------------------------------------------------------------

// Hyperliquid: APPROVE_AGENT is a mandatory setup descriptor with no params —
// the widget renders a single sign-and-submit button.
const approveAgentSetup: ProviderAction = {
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
const approveBuilderFeeSetup: ProviderAction = {
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
const registerApiKeySetup: ProviderAction = {
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
const hlAccountModeOption: ProviderAction = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description:
    'Choose how this account interacts with Hyperliquid. Defaults to dexAbstraction.',
  signers: [PerpsSigner.SDK],
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
const lighterAccountTypeOption: ProviderAction = {
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
      signers: [PerpsSigner.SDK],
      signingMethod: SigningMethod.EIP712,
    },
  ],
  categories: [{ id: 'hyperliquid', quoteAsset: usdcAsset }],
  funding: hourlyProviderFunding,
  chainId: 1337,
  depositAssets: [arbitrumUsdcDeposit],
  minOrderValueUsd: 10,
  supportedIntervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
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
      signers: [PerpsSigner.SDK],
      signingMethod: SigningMethod.WASM_BLOB,
    },
  ],
  categories: [
    { id: 'lighter', quoteAsset: { ...usdcAsset, providerId: 'lighter' } },
  ],
  funding: hourlyProviderFunding,
  chainId: 3586256,
  minOrderValueUsd: 10,
  minReduceOrderValueUsd: 1,
  minWithdrawalUsd: 5,
  depositFeeUsd: 0,
  withdrawalFeeUsd: 1,
  supportedIntervals: ['1m', '5m', '15m', '1h', '1d'],
}

// warn-level notice: the first producer is an HL HIP-3 sub-dex risk callout,
// but the type carries no provider-specific naming.
const warnNotice: TradeNotice = {
  level: 'warn',
  message:
    'This market is operated by a third-party deployer. See their docs at docs.example.invalid before trading.',
}

const infoNotice: TradeNotice = {
  level: 'info',
  message: 'Funding settles hourly on this market.',
}

// A category carrying a warn-level notice alongside the always-present fields.
const categoryWithWarnNotice: ProviderCategory = {
  id: 'kpepe',
  quoteAsset: usdcAsset,
  tradeNotice: warnNotice,
}

// tradeNotice is optional — a category may omit it entirely.
const categoryWithoutNotice: ProviderCategory = {
  id: 'hyperliquid',
  quoteAsset: usdcAsset,
}

// The "spot" category has no single fixed quote — quoteAsset is null.
const spotCategory: ProviderCategory = {
  id: 'spot',
  quoteAsset: null,
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
  categories: [],
  supportedIntervals: [],
}

// Announced-but-not-launched provider — `active: false` greys it out, and an
// inactive/no-candle provider declares an empty interval set (still required).
const announcedProvider: Provider = {
  key: 'announced',
  name: 'Announced',
  logoURI: 'https://example.invalid/announced.svg',
  signingMethod: SigningMethod.EIP712,
  active: false,
  setup: [],
  options: [],
  actions: [],
  categories: [],
  supportedIntervals: [],
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
  accountTradingMode: 0,
  readOnlyTokenApproved: false,
}

// RO-token approved state: expiry + scope populated alongside the flag.
const lighterConfigRoApproved: LighterAccountConfig = {
  provider: 'lighter',
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyRegistered: true,
  accountType: 0,
  accountTradingMode: 0,
  readOnlyTokenApproved: true,
  readOnlyTokenExpiry: 1_999_999_999,
  readOnlyTokenScope: 'all',
}

const hyperliquidAccountResponse: AccountResponse = {
  provider: 'hyperliquid',
  address: '0x0000000000000000000000000000000000000001',
  balances: [],
  collateralBalances: [
    {
      categoryId: 'hyperliquid',
      asset: usdcAsset,
      units: '100',
      valueUsd: '100',
    },
  ],
  positions: [],
  marginUsed: '0',
  unrealizedPnl: '0',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  config: hyperliquidConfig,
}

const lighterAccountResponse: AccountResponse = {
  provider: 'lighter',
  address: '0x0000000000000000000000000000000000000002',
  balances: [],
  collateralBalances: [
    {
      categoryId: 'lighter',
      asset: { ...usdcAsset, providerId: 'lighter' },
      units: '50',
      valueUsd: '50',
    },
  ],
  positions: [],
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

// All three provider arrays are exactly `ProviderAction[]` — categorisation
// lives in which array an entry sits in, not in the type.
type _SetupFieldShape = Expect<Equals<Provider['setup'], ProviderAction[]>>
type _OptionsFieldShape = Expect<Equals<Provider['options'], ProviderAction[]>>
type _ActionsFieldShape = Expect<Equals<Provider['actions'], ProviderAction[]>>

type _ProviderFundingKeys = Expect<
  Equals<keyof ProviderFunding, 'ratePeriodSeconds' | 'payoutCadenceSeconds'>
>
type _ProviderFundingRatePeriod = Expect<
  Equals<ProviderFunding['ratePeriodSeconds'], number>
>
type _ProviderFundingPayoutCadence = Expect<
  Equals<ProviderFunding['payoutCadenceSeconds'], number>
>
type _ProviderFundingExport = Expect<
  Equals<ExportedProviderFunding, ProviderFunding>
>
type _ProviderFundingOptional = Expect<
  Equals<Provider['funding'], ProviderFunding | undefined>
>
type _ProviderFundingIsOptional = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'funding'>, never>
>
type _MarketContextHasNoFundingCadence = Expect<
  Equals<
    Extract<keyof MarketContext, 'ratePeriodSeconds' | 'payoutCadenceSeconds'>,
    never
  >
>

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

// `supportedIntervals` reuses `OhlcvInterval` (no new enum) and is required —
// every provider declares its set, empty for inactive / no-candle venues.
type _SupportedIntervalsShape = Expect<
  Equals<Provider['supportedIntervals'], OhlcvInterval[]>
>
type _SupportedIntervalsIsRequired = Expect<
  Equals<
    Extract<RequiredKeys<Provider>, 'supportedIntervals'>,
    'supportedIntervals'
  >
>

// `chainId` is an optional bare `number` — the numeric alignment to
// `@lifi/types` `ChainId` is documentation-level, not a type dependency.
type _ChainIdShape = Expect<Equals<Provider['chainId'], number | undefined>>
type _ChainIdIsOptional = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'chainId'>, never>
>

// `depositAssets` is an optional `DepositAsset[]` — additive, so the existing
// `/providers` payload and all current consumers keep type-checking.
type _DepositAssetShape = Expect<
  Equals<Provider['depositAssets'], DepositAsset[] | undefined>
>
type _DepositAssetIsOptional = Expect<
  Equals<Extract<RequiredKeys<Provider>, 'depositAssets'>, never>
>

// `ProviderAction` keys: the three core fields plus the optional
// presentation / ordering hints. Catches an accidental rename / addition.
type _ProviderActionKeys = Expect<
  Equals<
    keyof ProviderAction,
    | 'type'
    | 'signers'
    | 'signingMethod'
    | 'title'
    | 'description'
    | 'params'
    | 'sequence'
  >
>

// `Param.type` is the literal `'string'` — numeric / boolean primitives
// are deferred until a real descriptor needs them.
type _ParamTypeIsString = Expect<Equals<Param['type'], 'string'>>

// `TradeNotice.level` is the closed two-member literal union — catches an
// accidental widening to `string` or a stray third level.
type _TradeNoticeLevel = Expect<Equals<TradeNotice['level'], 'info' | 'warn'>>

// `tradeNotice` is optional on the market — an absent notice is the common case.
type _TradeNoticeOptional = Expect<
  Equals<Extract<RequiredKeys<ProviderCategory>, 'tradeNotice'>, never>
>

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
  warnNotice,
  infoNotice,
  categoryWithWarnNotice,
  categoryWithoutNotice,
  spotCategory,
  providerWithNoDescriptors,
  announcedProvider,
  hyperliquidConfig,
  hyperliquidConfigUnset,
  lighterConfig,
  lighterConfigRoApproved,
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
  _ActionsFieldShape,
  _ProviderFundingKeys,
  _ProviderFundingRatePeriod,
  _ProviderFundingPayoutCadence,
  _ProviderFundingExport,
  _ProviderFundingOptional,
  _ProviderFundingIsOptional,
  _MarketContextHasNoFundingCadence,
  _SetupIsRequired,
  _OptionsIsRequired,
  _SupportedIntervalsShape,
  _SupportedIntervalsIsRequired,
  _ChainIdShape,
  _ChainIdIsOptional,
  _DepositAssetShape,
  _DepositAssetIsOptional,
  _ProviderActionKeys,
  _ParamTypeIsString,
  _TradeNoticeLevel,
  _TradeNoticeOptional,
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
    const param = hlAccountModeOption.params?.[0]
    expect(param?.name).toBe('mode')
    expect(param?.default?.value).toBe('dexAbstraction')
    expect(param?.values?.map((o) => o.value)).toEqual([
      'disabled',
      'dexAbstraction',
      'unifiedAccount',
    ])
  })

  it('lighter ACCOUNT_TYPE param wires through to AccountTypeParams.tier and is read-only', () => {
    const param = lighterProvider.options[0]?.params?.[0]
    expect(param?.name).toBe('tier')
    expect(param?.readOnly).toBe(true)
    expect(param?.values?.map((o) => o.value)).toEqual(['standard', 'premium'])
  })

  it('admits providers with empty setup and options arrays', () => {
    expect(providerWithNoDescriptors.setup).toEqual([])
    expect(providerWithNoDescriptors.options).toEqual([])
  })
})

describe('ProviderCategory.tradeNotice', () => {
  it('attaches a warn-level notice to a category', () => {
    expect(categoryWithWarnNotice.tradeNotice).toEqual(warnNotice)
    expect(categoryWithWarnNotice.tradeNotice?.level).toBe('warn')
  })

  it('admits a category with no notice (the common case)', () => {
    expect(categoryWithoutNotice.tradeNotice).toBeUndefined()
  })

  it('carries a null quoteAsset for the spot category', () => {
    expect(spotCategory.quoteAsset).toBeNull()
    expect(categoryWithoutNotice.quoteAsset?.displaySymbol).toBe('USDC')
  })

  it('carries the two notice levels the widget styles', () => {
    expect(warnNotice.level).toBe('warn')
    expect(infoNotice.level).toBe('info')
  })

  it('keeps the message plaintext — a URL stays inline text', () => {
    expect(warnNotice.message).toContain('docs.example.invalid')
  })
})

describe('Provider.funding', () => {
  it('keeps the rate period distinct from the payout cadence', () => {
    expect(hyperliquidProvider.funding).toEqual({
      ratePeriodSeconds: 60 * 60,
      payoutCadenceSeconds: 60 * 60,
    })
    expect(lighterProvider.funding?.ratePeriodSeconds).toBe(60 * 60)
    expect(lighterProvider.funding?.payoutCadenceSeconds).toBe(60 * 60)
  })

  it('is optional for providers without funding metadata', () => {
    expect(providerWithNoDescriptors.funding).toBeUndefined()
    expect(announcedProvider.funding).toBeUndefined()
  })
})

describe('Provider order-value minimums', () => {
  it('carries minOrderValueUsd to feed validateMargin', () => {
    expect(hyperliquidProvider.minOrderValueUsd).toBe(10)
  })

  it('carries an optional separate reduce-only floor', () => {
    expect(lighterProvider.minOrderValueUsd).toBe(10)
    expect(lighterProvider.minReduceOrderValueUsd).toBe(1)
  })

  it('admits a provider that advertises no order-value minimum', () => {
    expect(providerWithNoDescriptors.minOrderValueUsd).toBeUndefined()
    expect(providerWithNoDescriptors.minReduceOrderValueUsd).toBeUndefined()
  })
})

describe('Provider.supportedIntervals', () => {
  it('carries the venue candle intervals in ascending order', () => {
    expect(hyperliquidProvider.supportedIntervals).toEqual([
      '1m',
      '5m',
      '15m',
      '1h',
      '4h',
      '1d',
    ])
  })

  it('admits a per-provider interval set distinct from another venue', () => {
    expect(lighterProvider.supportedIntervals).toEqual([
      '1m',
      '5m',
      '15m',
      '1h',
      '1d',
    ])
  })

  it('declares an empty set for inactive / no-candle providers', () => {
    expect(announcedProvider.supportedIntervals).toEqual([])
    expect(providerWithNoDescriptors.supportedIntervals).toEqual([])
  })
})

describe('Provider.chainId', () => {
  it('carries the venue settlement chain id', () => {
    expect(hyperliquidProvider.chainId).toBe(1337)
    expect(lighterProvider.chainId).toBe(3586256)
  })

  it('admits a provider with no settlement chain', () => {
    expect(providerWithNoDescriptors.chainId).toBeUndefined()
    expect(announcedProvider.chainId).toBeUndefined()
  })
})

describe('Provider.depositAssets', () => {
  it('carries the on-chain deposit tokens the client routes to', () => {
    expect(hyperliquidProvider.depositAssets?.[0]?.chainId).toBe(42161)
    expect(hyperliquidProvider.depositAssets?.[0]?.address).toBe(
      '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
    )
    expect(hyperliquidProvider.depositAssets?.[0]?.decimals).toBe(6)
  })

  it('is an ordered list — the first entry is the default', () => {
    expect(Array.isArray(hyperliquidProvider.depositAssets)).toBe(true)
    expect(hyperliquidProvider.depositAssets?.[0]).toBe(arbitrumUsdcDeposit)
  })

  it('is distinct from the category quoteAsset (pricing unit)', () => {
    expect(hyperliquidProvider.categories[0]?.quoteAsset?.displaySymbol).toBe(
      'USDC'
    )
    expect(hyperliquidProvider.depositAssets?.[0]?.displaySymbol).toBe('USDC')
    expect(
      'address' in (hyperliquidProvider.categories[0]?.quoteAsset ?? {})
    ).toBe(false)
  })

  it('is optional — a provider may advertise no on-chain deposit token', () => {
    expect(providerWithNoDescriptors.depositAssets).toBeUndefined()
    expect(lighterProvider.depositAssets).toBeUndefined()
  })
})

describe('Provider withdrawal minimum and deposit/withdrawal fees', () => {
  it('carries minWithdrawalUsd and the flat deposit/withdrawal fees', () => {
    expect(lighterProvider.minWithdrawalUsd).toBe(5)
    expect(lighterProvider.depositFeeUsd).toBe(0)
    expect(lighterProvider.withdrawalFeeUsd).toBe(1)
  })

  it('admits a provider that advertises no withdrawal minimum or fees', () => {
    expect(providerWithNoDescriptors.minWithdrawalUsd).toBeUndefined()
    expect(providerWithNoDescriptors.depositFeeUsd).toBeUndefined()
    expect(providerWithNoDescriptors.withdrawalFeeUsd).toBeUndefined()
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

  it('defaults the RO token to unapproved with expiry/scope absent', () => {
    expect(lighterConfig.readOnlyTokenApproved).toBe(false)
    expect(lighterConfig.readOnlyTokenExpiry).toBeUndefined()
    expect(lighterConfig.readOnlyTokenScope).toBeUndefined()
  })

  it('carries RO token expiry and scope when approved', () => {
    expect(lighterConfigRoApproved.readOnlyTokenApproved).toBe(true)
    expect(lighterConfigRoApproved.readOnlyTokenExpiry).toBe(1_999_999_999)
    expect(lighterConfigRoApproved.readOnlyTokenScope).toBe('all')
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
