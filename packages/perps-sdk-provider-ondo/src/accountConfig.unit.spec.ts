import type { OndoAccountConfig, SetupAction } from '@lifi/perps-types'
import {
  ActionRelay,
  ActionType,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
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

const syncFeeAttributionDescriptor: SetupAction = {
  type: ActionType.SYNC_FEE_ATTRIBUTION,
  options: null,
  revoke: null,
  signer: PerpsSigner.SDK,
  relay: ActionRelay.API,
  signingMethod: SigningMethod.HMAC,
  params: [],
}

describe('projectOndoConfigSettings', () => {
  it('throws for ADD_WITHDRAWAL_ADDRESS — a withdraw-flow step, never a setup descriptor', () => {
    const addWithdrawalAddressDescriptor: SetupAction = {
      options: null,
      revoke: null,
      type: ActionType.ADD_WITHDRAWAL_ADDRESS,
      signer: PerpsSigner.USER,
      relay: ActionRelay.CLIENT,
      signingMethod: SigningMethod.SESSION,
      params: [],
    }
    expect(() =>
      projectOndoConfigSettings(baseConfig, [addWithdrawalAddressDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })

  it('throws for SYNC_FEE_ATTRIBUTION — never a setup descriptor', () => {
    expect(() =>
      projectOndoConfigSettings(baseConfig, [syncFeeAttributionDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })
})
