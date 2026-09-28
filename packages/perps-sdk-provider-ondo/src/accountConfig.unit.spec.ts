import type { OndoAccountConfig, ProviderAction } from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { projectOndoConfigSettings } from './accountConfig.js'

const baseConfig: OndoAccountConfig = {
  provider: 'ondo',
  loggedIn: false,
  termsAccepted: false,
  apiKeyRegistered: false,
  referralSet: false,
  depositAddress: null,
}

const syncFeeAttributionDescriptor: ProviderAction = {
  type: ActionType.SYNC_FEE_ATTRIBUTION,
  signers: [PerpsSigner.SDK],
  signingMethod: SigningMethod.HMAC,
  params: [],
}

describe('projectOndoConfigSettings', () => {
  it('throws for ADD_WITHDRAWAL_ADDRESS — a withdraw-flow step, never a setup or options descriptor', () => {
    const addWithdrawalAddressDescriptor: ProviderAction = {
      type: ActionType.ADD_WITHDRAWAL_ADDRESS,
      signers: [PerpsSigner.USER],
      signingMethod: SigningMethod.SESSION,
      params: [],
    }
    expect(() =>
      projectOndoConfigSettings(
        baseConfig,
        [addWithdrawalAddressDescriptor],
        []
      )
    ).toThrow(/no projection for descriptor type/)
    expect(() =>
      projectOndoConfigSettings(
        baseConfig,
        [],
        [addWithdrawalAddressDescriptor]
      )
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for SYNC_FEE_ATTRIBUTION — never a setup or options descriptor', () => {
    expect(() =>
      projectOndoConfigSettings(baseConfig, [syncFeeAttributionDescriptor], [])
    ).toThrow(/no projection for descriptor type/)
    expect(() =>
      projectOndoConfigSettings(baseConfig, [], [syncFeeAttributionDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })
})
