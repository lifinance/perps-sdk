import type { HyperliquidAccountConfig, SetupAction } from '@lifi/perps-types'
import {
  ActionRelay,
  ActionType,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectHyperliquidConfigSettings } from './accountConfig.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const approveAgentSetup: SetupAction = {
  options: null,
  revoke: null,
  type: ActionType.APPROVE_AGENT,
  title: 'Approve agent wallet',
  description: 'Authorise the SDK session signer.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const revokeAgentSetup: SetupAction = {
  options: null,
  revoke: null,
  type: ActionType.REVOKE_AGENT,
  title: 'Revoke agent wallet',
  description: 'Remove the SDK session signer.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const approveBuilderFeeSetup: SetupAction = {
  options: null,
  revoke: null,
  type: ActionType.APPROVE_BUILDER_FEE,
  title: 'Approve builder fee',
  description: 'Authorise the LI.FI builder fee.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const setReferralSetup: SetupAction = {
  options: null,
  revoke: null,
  type: ActionType.SET_REFERRAL,
  title: 'Initialize account via LI.FI',
  description: 'Enable the LI.FI referral code.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const modeOption = (title: string, mode: string) => ({
  title,
  type: ActionType.ACCOUNT_MODE,
  params: { mode },
})

const accountModeSetup: SetupAction = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description: 'Choose how this account interacts with Hyperliquid.',
  signer: PerpsSigner.USER,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.EIP712,
  params: [],
  options: [
    modeOption('Manual', 'disabled'),
    modeOption('Dex abstraction', 'dexAbstraction'),
    modeOption('Unified account', 'unifiedAccount'),
  ],
  revoke: null,
}

const baseConfig: HyperliquidAccountConfig = {
  provider: 'hyperliquid',
  abstractionMode: 'dexAbstraction',
  agents: [],
  dexStates: [],
}

describe('projectHyperliquidConfigSettings', () => {
  it('projects APPROVE_AGENT, APPROVE_BUILDER_FEE and SET_REFERRAL setup descriptors with empty values', () => {
    const result = projectHyperliquidConfigSettings(baseConfig, [
      setReferralSetup,
      approveAgentSetup,
      approveBuilderFeeSetup,
    ])
    expect(result).toEqual([
      { type: ActionType.SET_REFERRAL, values: [] },
      { type: ActionType.APPROVE_AGENT, values: [] },
      { type: ActionType.APPROVE_BUILDER_FEE, values: [] },
    ])
  })

  it('projects a REVOKE_AGENT setup descriptor with empty values', () => {
    const result = projectHyperliquidConfigSettings(baseConfig, [
      revokeAgentSetup,
    ])
    expect(result).toEqual([{ type: ActionType.REVOKE_AGENT, values: [] }])
  })

  it('projects ACCOUNT_MODE with value from config.abstractionMode', () => {
    const result = projectHyperliquidConfigSettings(baseConfig, [
      accountModeSetup,
    ])
    expect(result).toEqual([
      {
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'dexAbstraction' }],
        satisfied: true,
      },
    ])
  })

  it('projects a never-set abstraction (null) as the offered off value, satisfied', () => {
    const config: HyperliquidAccountConfig = {
      ...baseConfig,
      abstractionMode: null,
    }
    const result = projectHyperliquidConfigSettings(config, [accountModeSetup])
    expect(result[0]).toEqual({
      type: ActionType.ACCOUNT_MODE,
      values: [{ name: 'mode', value: 'disabled' }],
      satisfied: true,
    })
  })

  it('preserves the order of the setup descriptors', () => {
    const result = projectHyperliquidConfigSettings(baseConfig, [
      approveAgentSetup,
      approveBuilderFeeSetup,
      accountModeSetup,
    ])
    expect(result.map((s) => s.type)).toEqual([
      ActionType.APPROVE_AGENT,
      ActionType.APPROVE_BUILDER_FEE,
      ActionType.ACCOUNT_MODE,
    ])
  })

  it('returns an empty array when no descriptors are declared', () => {
    expect(projectHyperliquidConfigSettings(baseConfig, [])).toEqual([])
  })

  describe('ACCOUNT_MODE satisfaction against the offered values', () => {
    // The descriptor spells the off state `default`; `null` and `disabled` are
    // the other two spellings of the same account state.
    const offeredDefault: SetupAction = {
      ...accountModeSetup,
      options: [
        modeOption('Manual', 'default'),
        modeOption('Unified account', 'unifiedAccount'),
      ],
    }
    const projectFor = (abstractionMode: string | null) =>
      projectHyperliquidConfigSettings({ ...baseConfig, abstractionMode }, [
        offeredDefault,
      ])[0]

    it.each([
      null,
      'default',
      'disabled',
    ])('reads abstractionMode %s as the offered `default`, satisfied', (abstractionMode) => {
      expect(projectFor(abstractionMode)).toEqual({
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'default' }],
        satisfied: true,
      })
    })

    it('reads dexAbstraction as unsatisfied, keeping its own value, when the descriptor does not offer it', () => {
      expect(projectFor('dexAbstraction')).toEqual({
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'dexAbstraction' }],
        satisfied: false,
      })
    })

    it('keeps a null abstraction unsatisfied when the descriptor offers no off value', () => {
      const onlyUnified: SetupAction = {
        ...offeredDefault,
        options: [modeOption('Unified account', 'unifiedAccount')],
      }
      expect(
        projectHyperliquidConfigSettings(
          { ...baseConfig, abstractionMode: null },
          [onlyUnified]
        )[0]
      ).toEqual({
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: null }],
        satisfied: false,
      })
    })
  })

  it('throws when a descriptor type is not valid on Hyperliquid setup', () => {
    // PLACE_ORDER is a trading action, never on setup. The mapper
    // throws rather than silently mis-projecting — this catches descriptor
    // emission bugs loudly.
    const badDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.PLACE_ORDER,
      title: 'Place order',
      description: 'Trading action — should not appear here.',
      signer: PerpsSigner.SDK,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectHyperliquidConfigSettings(baseConfig, [badDescriptor])
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
      projectHyperliquidConfigSettings(baseConfig, [badDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for UPDATE_ASSET_COLLATERAL — Lighter-only per-asset action, no Hyperliquid projection', () => {
    const badDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.UPDATE_ASSET_COLLATERAL,
      title: 'Update asset collateral',
      description: 'Lighter-only — should not appear here.',
      signer: PerpsSigner.USER,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.WASM_BLOB,
      params: [],
    }
    expect(() =>
      projectHyperliquidConfigSettings(baseConfig, [badDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for APPROVE_INTEGRATOR — Lighter-only signing action, no Hyperliquid projection', () => {
    const approveIntegratorSetup: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.APPROVE_INTEGRATOR,
      title: 'Approve integrator',
      description: 'Lighter-only — should not appear here.',
      signer: PerpsSigner.USER,
      relay: ActionRelay.API,
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectHyperliquidConfigSettings(baseConfig, [approveIntegratorSetup])
    ).toThrow(/no projection for descriptor type/)
  })
})
