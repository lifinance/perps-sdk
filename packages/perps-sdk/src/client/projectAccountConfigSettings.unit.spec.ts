import type {
  HyperliquidAccountConfig,
  LighterAccountConfig,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectAccountConfigSettings } from './projectAccountConfigSettings.js'

const hyperliquidApproveAgent: ProviderSetup = {
  type: ActionType.APPROVE_AGENT,
  title: 'Approve agent wallet',
  description: 'Authorise the SDK session signer.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.EIP712,
  params: [],
}

const hyperliquidAccountMode: ProviderOption = {
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
        { value: 'unifiedAccount', label: 'Unified account' },
      ],
    },
  ],
}

const lighterRegisterApiKey: ProviderSetup = {
  type: ActionType.REGISTER_API_KEY,
  title: 'Register session API key',
  description: 'Register a Lighter API key.',
  signers: [PerpsSigner.USER],
  signingMethod: SigningMethod.WASM_BLOB,
  params: [],
}

const lighterAccountType: ProviderOption = {
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
    },
  ],
}

describe('projectAccountConfigSettings (dispatcher)', () => {
  it('dispatches Hyperliquid configs through the HL mapper', () => {
    const config: HyperliquidAccountConfig = {
      provider: 'hyperliquid',
      abstractionMode: 'unifiedAccount',
      agents: [],
    }
    const result = projectAccountConfigSettings(
      config,
      [hyperliquidApproveAgent],
      [hyperliquidAccountMode]
    )
    expect(result).toEqual([
      { type: ActionType.APPROVE_AGENT, values: [] },
      {
        type: ActionType.ACCOUNT_MODE,
        values: [{ name: 'mode', value: 'unifiedAccount' }],
      },
    ])
  })

  it('dispatches Lighter configs through the Lighter mapper', () => {
    const config: LighterAccountConfig = {
      provider: 'lighter',
      accountIndex: 7,
      apiKeyIndex: 1,
      apiKeyRegistered: true,
      accountType: 1,
    }
    const result = projectAccountConfigSettings(
      config,
      [lighterRegisterApiKey],
      [lighterAccountType]
    )
    expect(result).toEqual([
      { type: ActionType.REGISTER_API_KEY, values: [] },
      {
        type: ActionType.ACCOUNT_TYPE,
        values: [{ name: 'tier', value: 1 }],
      },
    ])
  })

  it('produces exactly one setting per descriptor', () => {
    const config: HyperliquidAccountConfig = {
      provider: 'hyperliquid',
      abstractionMode: null,
      agents: [],
    }
    const result = projectAccountConfigSettings(
      config,
      [hyperliquidApproveAgent],
      [hyperliquidAccountMode]
    )
    expect(result).toHaveLength(2)
  })
})
