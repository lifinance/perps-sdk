import type { LighterAccountConfig, SetupAction } from '@lifi/perps-types'
import {
  ActionRelay,
  ActionType,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectLighterConfigSettings } from './accountConfig.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const registerApiKeySetup: SetupAction = {
  options: null,
  revoke: null,
  type: ActionType.REGISTER_API_KEY,
  title: 'Register session API key',
  description: 'Register a Lighter API key.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
}

const tierOption = (title: string, tier: string) => ({
  title,
  type: ActionType.ACCOUNT_TYPE,
  params: { tier },
})

const modeOption = (title: string, mode: string) => ({
  title,
  type: ActionType.ACCOUNT_MODE,
  params: { mode },
})

// Options bind only standard and premium; plus is absent.
const accountTypeSetup: SetupAction = {
  type: ActionType.ACCOUNT_TYPE,
  title: 'Account tier',
  description: 'Select the account tier.',
  signer: PerpsSigner.SDK,
  relay: ActionRelay.CLIENT,
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
  options: [
    { ...tierOption('Standard', 'standard'), default: true },
    tierOption('Premium', 'premium'),
  ],
  revoke: null,
}

const accountTypeSetupWithPlus: SetupAction = {
  ...accountTypeSetup,
  options: [
    { ...tierOption('Standard', 'standard'), default: true },
    tierOption('Plus', 'plus'),
    tierOption('Premium', 'premium'),
  ],
}

const accountTypeSetupWithoutOptions: SetupAction = {
  ...accountTypeSetup,
  options: [],
}

const accountModeSetup: SetupAction = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description: 'Unified vs Simple trading account.',
  signer: PerpsSigner.SDK,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
  options: [
    modeOption('Simple', 'simpleTradingAccount'),
    modeOption('Unified', 'unifiedTradingAccount'),
  ],
  revoke: null,
}

const baseConfig: LighterAccountConfig = {
  provider: 'lighter',
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyRegistered: true,
  accountType: 0,
  availableBalance: '100',
  totalAssetValue: '500',
  accountTradingMode: 0,
  assetCollateral: [],
  readOnlyTokenApproved: false,
  referralPresent: false,
}

describe('projectLighterConfigSettings', () => {
  it('projects REGISTER_API_KEY satisfied from config.apiKeyRegistered', () => {
    expect(
      projectLighterConfigSettings(baseConfig, [registerApiKeySetup])
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: true },
    ])
    expect(
      projectLighterConfigSettings({ ...baseConfig, apiKeyRegistered: false }, [
        registerApiKeySetup,
      ])
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: false },
    ])
  })

  it('projects the "plus" tier string once an option binds it', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, userTierName: 'plus' },
      [accountTypeSetupWithPlus]
    )
    expect(result).toEqual([
      {
        type: ActionType.ACCOUNT_TYPE,
        values: [{ name: 'tier', value: 'plus' }],
        satisfied: true,
      },
    ])
  })

  it('projects the "premium" tier string over the account_type integer', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountType: 0, userTierName: 'premium' },
      [accountTypeSetupWithPlus]
    )
    expect(result[0].values[0].value).toBe('premium')
  })

  it('projects the "standard" tier string', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountType: 1, userTierName: 'standard' },
      [accountTypeSetupWithPlus]
    )
    expect(result[0].values[0].value).toBe('standard')
  })

  it('projects a tier string no option binds to null', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, userTierName: 'plus' },
      [accountTypeSetup]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('projects a tier string to null when the descriptor binds no tier options', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, userTierName: 'plus' },
      [accountTypeSetupWithoutOptions]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('projects an unknown tier string to null rather than guessing a tier', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, userTierName: 'diamond' },
      [accountTypeSetupWithPlus]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('reads ACCOUNT_TYPE unsatisfied when no option binds the tier', () => {
    expect(
      projectLighterConfigSettings({ ...baseConfig, userTierName: 'plus' }, [
        accountTypeSetup,
      ])
    ).toEqual([
      {
        type: ActionType.ACCOUNT_TYPE,
        values: [{ name: 'tier', value: null }],
        satisfied: false,
      },
    ])
  })

  it('reads ACCOUNT_TYPE unsatisfied when no tier string was read', () => {
    expect(
      projectLighterConfigSettings(baseConfig, [accountTypeSetupWithPlus])
    ).toEqual([
      {
        type: ActionType.ACCOUNT_TYPE,
        values: [{ name: 'tier', value: null }],
        satisfied: false,
      },
    ])
  })

  // `account_type` is Lighter's SubAccountType (Main = 0, Sub = 1, Public = 2,
  // LighterPublic = 3, Staking = 4), not a tier, so no integer projects a tier.
  it.each([
    0, 1, 2, 3, 4, 99,
  ])('projects null for account_type %i when the account-limits read supplies no tier string', (accountType) => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountType },
      [accountTypeSetupWithPlus]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('projects ACCOUNT_MODE = 1 as the wire string "unifiedTradingAccount"', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountTradingMode: 1 },
      [accountModeSetup]
    )
    expect(result[0]).toEqual({
      type: ActionType.ACCOUNT_MODE,
      values: [{ name: 'mode', value: 'unifiedTradingAccount' }],
      satisfied: true,
    })
  })

  it('projects ACCOUNT_MODE = 0 as the wire string "simpleTradingAccount"', () => {
    const result = projectLighterConfigSettings(baseConfig, [accountModeSetup])
    expect(result[0]).toEqual({
      type: ActionType.ACCOUNT_MODE,
      values: [{ name: 'mode', value: 'simpleTradingAccount' }],
      satisfied: true,
    })
  })

  it('projects an unmapped account_trading_mode integer to null', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountTradingMode: 99 },
      [accountModeSetup]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('reads ACCOUNT_MODE unsatisfied when no option binds the mode', () => {
    const simpleOnlyModeSetup: SetupAction = {
      ...accountModeSetup,
      options: [modeOption('Simple', 'simpleTradingAccount')],
    }
    expect(
      projectLighterConfigSettings({ ...baseConfig, accountTradingMode: 1 }, [
        simpleOnlyModeSetup,
      ])
    ).toEqual([
      {
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'unifiedTradingAccount' }],
        satisfied: false,
      },
    ])
  })

  it('preserves the order of the setup descriptors', () => {
    const result = projectLighterConfigSettings(baseConfig, [
      registerApiKeySetup,
      accountTypeSetup,
    ])
    expect(result.map((s) => s.type)).toEqual([
      ActionType.REGISTER_API_KEY,
      ActionType.ACCOUNT_TYPE,
    ])
  })

  it('returns an empty array when no descriptors are declared', () => {
    expect(projectLighterConfigSettings(baseConfig, [])).toEqual([])
  })

  it('throws when a descriptor type is not valid on Lighter setup', () => {
    // APPROVE_AGENT is HL-only; on Lighter it's a descriptor-emission bug.
    const badDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.APPROVE_AGENT,
      title: 'Approve agent',
      description: 'HL-only — should not appear here.',
      signer: PerpsSigner.USER,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [badDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for SYNC_FEE_ATTRIBUTION — never a setup descriptor', () => {
    const badDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.SYNC_FEE_ATTRIBUTION,
      signer: PerpsSigner.SDK,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.HMAC,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [badDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for UPDATE_ASSET_COLLATERAL — a runtime per-asset action, never a setup descriptor', () => {
    const badDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.UPDATE_ASSET_COLLATERAL,
      title: 'Update asset collateral',
      description: 'Runtime toggle — should not appear here.',
      signer: PerpsSigner.SDK,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.WASM_BLOB,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [badDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('projects SET_REFERRAL satisfaction from config.referralPresent', () => {
    const setReferralSetup: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.SET_REFERRAL,
      title: 'Apply LI.FI Referral',
      description: "Applies LI.FI's referral code to your Lighter account.",
      signer: PerpsSigner.SDK,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.WASM_BLOB,
      params: [],
    }
    expect(
      projectLighterConfigSettings({ ...baseConfig, referralPresent: true }, [
        setReferralSetup,
      ])
    ).toEqual([{ type: ActionType.SET_REFERRAL, values: [], satisfied: true }])
    expect(
      projectLighterConfigSettings({ ...baseConfig, referralPresent: false }, [
        setReferralSetup,
      ])
    ).toEqual([{ type: ActionType.SET_REFERRAL, values: [], satisfied: false }])
  })

  it('projects APPROVE_INTEGRATOR setup gate with empty values and no local satisfaction', () => {
    const approveIntegratorSetup: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.APPROVE_INTEGRATOR,
      title: 'Authorise LI.FI Fees',
      description: "Authorises LI.FI's integrator account to collect fees.",
      signer: PerpsSigner.SDK,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.WASM_BLOB,
      params: [],
    }
    expect(
      projectLighterConfigSettings(baseConfig, [approveIntegratorSetup])
    ).toEqual([{ type: ActionType.APPROVE_INTEGRATOR, values: [] }])
  })
})
