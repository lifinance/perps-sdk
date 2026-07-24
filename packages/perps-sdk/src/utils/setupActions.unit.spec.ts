import type { ProviderAction } from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { selectUserSetupActions } from './setupActions.js'

const action = (type: ActionType, signers: PerpsSigner[]): ProviderAction => ({
  type,
  signers,
  signingMethod: SigningMethod.EIP712,
})

describe('selectUserSetupActions', () => {
  it('keeps descriptors whose signers include USER', () => {
    const setup = [action(ActionType.SIWE_LOGIN, [PerpsSigner.USER])]
    expect(selectUserSetupActions(setup)).toEqual(setup)
  })

  it('holds back descriptors the SDK signs on its own', () => {
    const setup = [action(ActionType.SET_REFERRAL, [PerpsSigner.SDK])]
    expect(selectUserSetupActions(setup)).toEqual([])
  })

  it('keeps a descriptor that lists both USER and SDK signers', () => {
    const shared = action(ActionType.APPROVE_AGENT, [
      PerpsSigner.USER,
      PerpsSigner.SDK,
    ])
    expect(selectUserSetupActions([shared])).toEqual([shared])
  })

  it('holds back SDK steps from a mixed list and preserves order', () => {
    const login = action(ActionType.SIWE_LOGIN, [PerpsSigner.USER])
    const referral = action(ActionType.SET_REFERRAL, [PerpsSigner.SDK])
    const agent = action(ActionType.APPROVE_AGENT, [PerpsSigner.USER])
    expect(selectUserSetupActions([login, referral, agent])).toEqual([
      login,
      agent,
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(selectUserSetupActions([])).toEqual([])
  })
})
