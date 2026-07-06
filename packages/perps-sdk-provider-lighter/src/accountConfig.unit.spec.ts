import type { LighterAccountConfig, ProviderAction } from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectLighterConfigSettings } from './accountConfig.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const registerApiKeySetup: ProviderAction = {
  type: ActionType.REGISTER_API_KEY,
  title: 'Register session API key',
  description: 'Register a Lighter API key.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
}

const accountTypeOption: ProviderAction = {
  type: ActionType.ACCOUNT_TYPE,
  title: 'Account tier',
  description: 'Premium tier reduces fees.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [
    {
      name: 'tier',
      type: 'string',
      values: [
        { value: 'standard', label: 'Standard' },
        { value: 'premium', label: 'Premium' },
      ],
      default: { value: 'standard', label: 'Standard' },
    },
  ],
}

// Lighter exposes no abstraction-mode equivalent; if a future backend ever
// emits this descriptor on Lighter the projection is always null.
const accountModeOption: ProviderAction = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description: 'Read-only on Lighter.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [
    {
      name: 'mode',
      type: 'string',
      values: [{ value: 'default', label: 'Default' }],
      readOnly: true,
    },
  ],
}

const baseConfig: LighterAccountConfig = {
  provider: 'lighter',
  accountIndex: 42,
  apiKeyIndex: 1,
  apiKeyRegistered: true,
  accountType: 0,
}

describe('projectLighterConfigSettings', () => {
  it('projects REGISTER_API_KEY satisfied from config.apiKeyRegistered', () => {
    expect(
      projectLighterConfigSettings(baseConfig, [registerApiKeySetup], [])
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: true },
    ])
    expect(
      projectLighterConfigSettings(
        { ...baseConfig, apiKeyRegistered: false },
        [registerApiKeySetup],
        []
      )
    ).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [], satisfied: false },
    ])
  })

  it('projects ACCOUNT_TYPE = 1 as the wire string "premium"', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountType: 1 },
      [],
      [accountTypeOption]
    )
    expect(result).toEqual([
      {
        type: ActionType.ACCOUNT_TYPE,
        values: [{ name: 'tier', value: 'premium' }],
      },
    ])
  })

  it('projects an unmapped account_type integer to null (drift surfaces in the widget rather than silently)', () => {
    const result = projectLighterConfigSettings(
      { ...baseConfig, accountType: 99 },
      [],
      [accountTypeOption]
    )
    expect(result[0].values[0].value).toBeNull()
  })

  it('projects ACCOUNT_MODE with value: null on Lighter (no abstraction-mode equivalent)', () => {
    const result = projectLighterConfigSettings(
      baseConfig,
      [],
      [accountModeOption]
    )
    expect(result[0]).toEqual({
      type: ActionType.ACCOUNT_MODE,
      values: [{ name: 'mode', value: null }],
    })
  })

  it('projects accountType = 0 (Lighter\'s default tier integer) as the wire string "standard"', () => {
    const result = projectLighterConfigSettings(
      baseConfig,
      [],
      [accountTypeOption]
    )
    expect(result[0].values[0].value).toBe('standard')
  })

  it('preserves setup-then-options ordering of descriptors', () => {
    const result = projectLighterConfigSettings(
      baseConfig,
      [registerApiKeySetup],
      [accountTypeOption]
    )
    expect(result.map((s) => s.type)).toEqual([
      ActionType.REGISTER_API_KEY,
      ActionType.ACCOUNT_TYPE,
    ])
  })

  it('returns an empty array when no descriptors are declared', () => {
    expect(projectLighterConfigSettings(baseConfig, [], [])).toEqual([])
  })

  it('throws when a descriptor type is not valid on Lighter setup/options', () => {
    // APPROVE_AGENT is HL-only; on Lighter it's a descriptor-emission bug.
    const badDescriptor: ProviderAction = {
      type: ActionType.APPROVE_AGENT,
      title: 'Approve agent',
      description: 'HL-only — should not appear here.',
      signers: [PerpsSigner.USER],
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [badDescriptor], [])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for APPROVE_INTEGRATOR — signing action, not a projected setup/options setting', () => {
    const approveIntegratorSetup: ProviderAction = {
      type: ActionType.APPROVE_INTEGRATOR,
      title: 'Approve integrator',
      description: 'Signing action — not a projected config setting.',
      signers: [PerpsSigner.USER],
      signingMethod: SigningMethod.WASM_BLOB,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [approveIntegratorSetup], [])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for SET_REFERRAL — Hyperliquid-only, no Lighter projection', () => {
    const setReferralSetup: ProviderAction = {
      type: ActionType.SET_REFERRAL,
      title: 'Set referrer',
      description: 'HL-only — should not appear here.',
      signers: [PerpsSigner.USER],
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectLighterConfigSettings(baseConfig, [setReferralSetup], [])
    ).toThrow(/no projection for descriptor type/)
  })
})
