import type { SetupAction, SetupOption } from '@lifi/perps-types'
import {
  ActionRelay,
  ActionType,
  PerpsSigner,
  SigningMethod,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isSetupOptionFor, selectUserSetupActions } from './setupActions.js'

const step = (
  type: ActionType,
  signer: PerpsSigner,
  options: SetupOption[] | null = null
): SetupAction => ({
  type,
  signer,
  signingMethod: SigningMethod.EIP712,
  relay: ActionRelay.API,
  options,
  revoke: null,
})

const plusOption: SetupOption = {
  title: 'Plus',
  type: ActionType.ACCOUNT_TYPE,
  params: { tier: 'plus' },
  default: true,
}

describe('selectUserSetupActions', () => {
  it('keeps a USER-signed non-choice step', () => {
    const setup = [step(ActionType.SIWE_LOGIN, PerpsSigner.USER)]
    expect(selectUserSetupActions(setup)).toEqual(setup)
  })

  it('holds back a non-choice step the SDK signs on its own', () => {
    const setup = [step(ActionType.SET_REFERRAL, PerpsSigner.SDK)]
    expect(selectUserSetupActions(setup)).toEqual([])
  })

  it('keeps an SDK-signed choice step', () => {
    const tier = step(ActionType.ACCOUNT_TYPE, PerpsSigner.SDK, [plusOption])
    expect(selectUserSetupActions([tier])).toEqual([tier])
  })

  it('holds back SDK steps from a mixed list and preserves order', () => {
    const login = step(ActionType.SIWE_LOGIN, PerpsSigner.USER)
    const referral = step(ActionType.SET_REFERRAL, PerpsSigner.SDK)
    const agent = step(ActionType.APPROVE_AGENT, PerpsSigner.USER)
    expect(selectUserSetupActions([login, referral, agent])).toEqual([
      login,
      agent,
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(selectUserSetupActions([])).toEqual([])
  })
})

describe('isSetupOptionFor', () => {
  it('narrows an option to the action it executes', () => {
    expect(isSetupOptionFor(plusOption, ActionType.ACCOUNT_TYPE)).toBe(true)
    if (isSetupOptionFor(plusOption, ActionType.ACCOUNT_TYPE)) {
      expect(plusOption.params.tier).toBe('plus')
    }
  })

  it('rejects an option for another action', () => {
    expect(isSetupOptionFor(plusOption, ActionType.ACCOUNT_MODE)).toBe(false)
  })
})
