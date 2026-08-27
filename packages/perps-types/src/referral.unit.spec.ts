import { describe, expect, it } from 'vitest'
import { acceptTermsTypeFields } from './acceptTerms.js'
import type {
  CreateReferralCodeTypedData,
  OnboardTypedData,
  ReferralActivityResponse,
  ReferralStatus,
} from './referral.js'
import {
  createReferralCodeTypeFields,
  onboardTypeFields,
  ReferralCodeRejection,
} from './referral.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

describe('onboardTypeFields', () => {
  it('binds the account and every mutable field in the signed order', () => {
    expect(onboardTypeFields).toEqual([
      { name: 'action', type: 'string' },
      { name: 'account', type: 'address' },
      { name: 'termsVersion', type: 'string' },
      { name: 'referralCode', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ])
  })

  it('names one field per OnboardMessage member', () => {
    const message: OnboardTypedData['message'] = {
      action: 'Accept LI.FI Perps Terms of Service v3',
      account: ADDRESS,
      termsVersion: 'v3',
      referralCode: 'ABC123',
      nonce: '1',
      deadline: 1_800_000_000_000,
    }

    expect(onboardTypeFields.map((field) => field.name)).toEqual(
      Object.keys(message)
    )
  })

  it('leaves the AcceptTerms field list unchanged', () => {
    expect(acceptTermsTypeFields).toEqual([
      { name: 'action', type: 'string' },
      { name: 'acceptor', type: 'address' },
      { name: 'termsVersion', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ])
  })
})

describe('OnboardTypedData', () => {
  it('accepts a Terms-only signature with an empty referralCode', () => {
    const typedData: OnboardTypedData = {
      domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
      primaryType: 'Onboard',
      types: { Onboard: onboardTypeFields },
      message: {
        action: 'Accept LI.FI Perps Terms of Service v3',
        account: ADDRESS,
        termsVersion: 'v3',
        referralCode: '',
        nonce: '7',
        deadline: 1_800_000_000_000,
      },
    }

    expect(typedData.message.referralCode).toBe('')
    expect(Object.keys(typedData.message)).toEqual(
      onboardTypeFields.map((field) => field.name)
    )
  })

  it('accepts a referral-only signature with an empty termsVersion', () => {
    const typedData: OnboardTypedData = {
      domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
      primaryType: 'Onboard',
      types: { Onboard: onboardTypeFields },
      message: {
        action: 'Attach LI.FI Perps referral code ABC123',
        account: ADDRESS,
        termsVersion: '',
        referralCode: 'ABC123',
        nonce: '8',
        deadline: 1_800_000_000_000,
      },
    }

    expect(typedData.message.termsVersion).toBe('')
    expect(typedData.message.referralCode).toBe('ABC123')
  })

  it('accepts a combined signature carrying both terms and a code', () => {
    const typedData: OnboardTypedData = {
      domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
      primaryType: 'Onboard',
      types: { Onboard: onboardTypeFields },
      message: {
        action: 'Accept LI.FI Perps Terms of Service v3',
        account: ADDRESS,
        termsVersion: 'v3',
        referralCode: 'ABC123',
        nonce: '9',
        deadline: 1_800_000_000_000,
      },
    }

    expect(typedData.message.termsVersion).toBe('v3')
    expect(typedData.message.referralCode).toBe('ABC123')
  })
})

describe('createReferralCodeTypeFields', () => {
  it('binds the account and the reserved code in the signed order', () => {
    expect(createReferralCodeTypeFields).toEqual([
      { name: 'action', type: 'string' },
      { name: 'account', type: 'address' },
      { name: 'code', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ])
  })

  it('names one field per CreateReferralCodeMessage member', () => {
    const typedData: CreateReferralCodeTypedData = {
      domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
      primaryType: 'CreateReferralCode',
      types: { CreateReferralCode: createReferralCodeTypeFields },
      message: {
        action: 'Create LI.FI Perps referral code ABC123',
        account: ADDRESS,
        code: 'ABC123',
        nonce: '3',
        deadline: 1_800_000_000_000,
      },
    }

    expect(createReferralCodeTypeFields.map((field) => field.name)).toEqual(
      Object.keys(typedData.message)
    )
  })

  it('carries a primary type distinct from Onboard', () => {
    const onboardPrimaryType: OnboardTypedData['primaryType'] = 'Onboard'
    const createPrimaryType: CreateReferralCodeTypedData['primaryType'] =
      'CreateReferralCode'

    expect(createPrimaryType).not.toBe(onboardPrimaryType)
  })
})

describe('ReferralCodeRejection', () => {
  it('carries one distinct wire value per member', () => {
    const values = Object.values(ReferralCodeRejection)
    expect(new Set(values).size).toBe(values.length)
  })

  it('names the verdicts the backend can return for a candidate', () => {
    expect(Object.values(ReferralCodeRejection)).toEqual([
      'MALFORMED',
      'NOT_FOUND',
      'INACTIVE',
      'SELF_REFERRAL',
      'ALREADY_ATTACHED',
      'NOT_ELIGIBLE',
    ])
  })
})

describe('empty-state response shapes', () => {
  it('a status with no established state omits the optional fields', () => {
    const status: ReferralStatus = {
      address: ADDRESS,
      termsVersion: 'v3',
      termsAccepted: false,
      ownedCodeEligibility: { eligible: false },
    }

    expect(status.attachedCode).toBeUndefined()
    expect(status.ownedCode).toBeUndefined()
    expect(status.candidate).toBeUndefined()
    expect(status.onboarding).toBeUndefined()
  })

  it('an activity response with no attachments carries an empty page', () => {
    const activity: ReferralActivityResponse = {
      items: [],
      pagination: { limit: 0, hasMore: false },
    }

    expect(activity.items).toEqual([])
    expect(activity.pagination.hasMore).toBe(false)
    expect(activity.pagination.cursor).toBeUndefined()
  })
})
