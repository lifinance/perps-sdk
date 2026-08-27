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
  it('throws for SYNC_FEE_ATTRIBUTION — never a setup or options descriptor', () => {
    expect(() =>
      projectOndoConfigSettings(baseConfig, [syncFeeAttributionDescriptor], [])
    ).toThrow(/no projection for descriptor type/)
    expect(() =>
      projectOndoConfigSettings(baseConfig, [], [syncFeeAttributionDescriptor])
    ).toThrow(/no projection for descriptor type/)
  })
})
