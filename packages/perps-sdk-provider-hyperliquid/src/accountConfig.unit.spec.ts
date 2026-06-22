import type {
  HyperliquidAccountConfig,
  ProviderAction,
} from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectHyperliquidConfigSettings } from './accountConfig.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const approveAgentSetup: ProviderAction = {
  type: ActionType.APPROVE_AGENT,
  title: 'Approve agent wallet',
  description: 'Authorise the SDK session signer.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const approveBuilderFeeSetup: ProviderAction = {
  type: ActionType.APPROVE_BUILDER_FEE,
  title: 'Approve builder fee',
  description: 'Authorise the LI.FI builder fee.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const accountModeOption: ProviderAction = {
  type: ActionType.ACCOUNT_MODE,
  title: 'Account mode',
  description: 'Choose how this account interacts with Hyperliquid.',
  signers: [PerpsSigner.AGENT],
  signingMethod: SigningMethod.EIP712,
  params: [
    {
      name: 'mode',
      type: 'string',
      values: [
        { value: 'disabled', label: 'Standard' },
        { value: 'dexAbstraction', label: 'Dex abstraction' },
        { value: 'unifiedAccount', label: 'Unified account' },
      ],
      default: { value: 'dexAbstraction', label: 'Dex abstraction' },
    },
  ],
}

const baseConfig: HyperliquidAccountConfig = {
  provider: 'hyperliquid',
  abstractionMode: 'dexAbstraction',
  agents: [],
}

describe('projectHyperliquidConfigSettings', () => {
  it('projects APPROVE_AGENT and APPROVE_BUILDER_FEE setup descriptors with empty values', () => {
    const result = projectHyperliquidConfigSettings(
      baseConfig,
      [approveAgentSetup, approveBuilderFeeSetup],
      []
    )
    expect(result).toEqual([
      { type: ActionType.APPROVE_AGENT, values: [] },
      { type: ActionType.APPROVE_BUILDER_FEE, values: [] },
    ])
  })

  it('projects ACCOUNT_MODE with value from config.abstractionMode', () => {
    const result = projectHyperliquidConfigSettings(
      baseConfig,
      [],
      [accountModeOption]
    )
    expect(result).toEqual([
      {
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'dexAbstraction' }],
      },
    ])
  })

  it('projects ACCOUNT_MODE with value: null when abstraction has never been set', () => {
    const config: HyperliquidAccountConfig = {
      ...baseConfig,
      abstractionMode: null,
    }
    const result = projectHyperliquidConfigSettings(
      config,
      [],
      [accountModeOption]
    )
    expect(result[0]).toEqual({
      type: ActionType.ACCOUNT_MODE,
      values: [{ name: 'mode', value: null }],
    })
  })

  it('preserves setup-then-options ordering of descriptors', () => {
    const result = projectHyperliquidConfigSettings(
      baseConfig,
      [approveAgentSetup, approveBuilderFeeSetup],
      [accountModeOption]
    )
    expect(result.map((s) => s.type)).toEqual([
      ActionType.APPROVE_AGENT,
      ActionType.APPROVE_BUILDER_FEE,
      ActionType.ACCOUNT_MODE,
    ])
  })

  it('returns an empty array when no descriptors are declared', () => {
    expect(projectHyperliquidConfigSettings(baseConfig, [], [])).toEqual([])
  })

  it('throws when a descriptor type is not valid on Hyperliquid setup/options', () => {
    // PLACE_ORDER is a trading action, never on setup/options. The mapper
    // throws rather than silently mis-projecting — this catches descriptor
    // emission bugs loudly.
    const badDescriptor: ProviderAction = {
      type: ActionType.PLACE_ORDER,
      title: 'Place order',
      description: 'Trading action — should not appear here.',
      signers: [PerpsSigner.AGENT],
      signingMethod: SigningMethod.EIP712,
      params: [],
    }
    expect(() =>
      projectHyperliquidConfigSettings(baseConfig, [badDescriptor], [])
    ).toThrow(/no projection for descriptor type/)
  })
})
