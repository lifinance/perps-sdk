import { createMemoryStorage } from '@lifi/perps-sdk'
import {
  ActionType,
  PerpsErrorCode,
  type StarkActionStep,
} from '@lifi/perps-types'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFetchMock, okAnswer } from '../../test/fetchMock.js'
import {
  registrationCases,
  signingKey,
  starkFixtures,
} from '../../test/fixtures/starkFixtures.js'
import {
  DEFAULT_EXTENDED_API_URL,
  EXTENDED_SIGNING_DOMAIN,
} from '../constants.js'
import { ExtendedApiClient } from '../utils/apiClient.js'
import { ExtendedCredentialStore } from './ExtendedCredentialStore.js'
import {
  buildAccountCreationTypedData,
  registerExtendedApiKey,
  signOnboardingRequest,
} from './registerAccount.js'

const wallet = createWalletClient({
  account: privateKeyToAccount(`0x${starkFixtures.meta.ethPrivateKey}`),
  transport: http('http://127.0.0.1:1'),
})
const { ethAddress, frozenNow } = starkFixtures.meta
const [registration] = registrationCases
const [apiKeyRequest] = starkFixtures.apiRequestSignature

const accountInfoAnswer = (l2Key: string) =>
  okAnswer({ accountId: 330870, accountIndex: 0, l2Key, l2Vault: '430876' })

function setup(answers: Parameters<typeof createFetchMock>[0]) {
  const { fetchImpl, requests } = createFetchMock(answers)
  const credentialStore = new ExtendedCredentialStore(
    createMemoryStorage(),
    DEFAULT_EXTENDED_API_URL
  )
  const deps = {
    client: new ExtendedApiClient(DEFAULT_EXTENDED_API_URL, { fetchImpl }),
    credentialStore,
    baseUrl: DEFAULT_EXTENDED_API_URL,
    signingDomain: EXTENDED_SIGNING_DOMAIN,
  }
  return { deps, requests, credentialStore }
}

/** The onboarding request as the backend builds it, with the LI.FI referral code. */
const onboardingStep = (
  creation: Record<string, unknown> = {
    ...registration.payload.accountCreation,
    accountIndex: 0,
  }
): StarkActionStep => ({
  action: ActionType.CREATE_ACCOUNT,
  stark: {
    request: {
      method: 'POST',
      path: '/auth/onboard',
      body: { accountCreation: creation, referralCode: 'LIFI' },
    },
    messages: [],
  },
})

describe('Extended account setup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(frozenNow))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('signs the key seed exactly as the Python SDK', async () => {
    const [keyDerivation] = starkFixtures.keyDerivation
    const signature = await wallet.signTypedData(
      buildAccountCreationTypedData(ethAddress, EXTENDED_SIGNING_DOMAIN)
    )
    expect(signature).toBe(`0x${keyDerivation.walletSignature}`)
  })

  it('signs the backend onboarding request with the Python SDK signatures, and sends nothing', async () => {
    const { deps, requests } = setup([])

    const signed = await signOnboardingRequest(
      deps,
      wallet,
      ethAddress,
      onboardingStep()
    )

    expect(requests).toEqual([])
    expect(signed.clientSent).toBeUndefined()
    expect(signed.stark.request.body).toEqual({
      accountCreation: {
        ...registration.payload.accountCreation,
        accountIndex: 0,
      },
      referralCode: 'LIFI',
      l1Signature: registration.payload.l1Signature,
      l2Key: registration.payload.l2Key,
      l2Signature: registration.payload.l2Signature,
    })
  })

  it.each([
    [
      'another wallet',
      { wallet: '0x000000000000000000000000000000000000dEaD' },
    ],
    ['another host', { host: 'https://example.com' }],
    ['another action', { action: 'CREATE_SUB_ACCOUNT' }],
  ])('refuses an onboarding request for %s', async (_label, change) => {
    const { deps } = setup([])

    await expect(
      signOnboardingRequest(
        deps,
        wallet,
        ethAddress,
        onboardingStep({
          ...registration.payload.accountCreation,
          accountIndex: 0,
          ...change,
        })
      )
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
  })

  it('creates the API key without an account header, reads the account, and stores the credentials', async () => {
    const { deps, requests, credentialStore } = setup([
      okAnswer({ key: 'test-api-key' }),
      accountInfoAnswer(signingKey.starkPublicKey),
    ])

    const credentials = await registerExtendedApiKey(deps, wallet, ethAddress)

    const [apiKey, accountInfo] = requests
    expect(apiKey.url).toBe(`${DEFAULT_EXTENDED_API_URL}${apiKeyRequest.path}`)
    expect(apiKey.headers).toMatchObject({
      l1_signature: apiKeyRequest.signature,
      l1_message_time: apiKeyRequest.time,
    })
    expect(apiKey.headers['x-x10-active-account']).toBeUndefined()
    expect(accountInfo.headers['x-api-key']).toBe('test-api-key')
    expect(credentials).toEqual({
      starkPrivateKey: signingKey.starkPrivateKey,
      starkPublicKey: signingKey.starkPublicKey,
      accountId: '330870',
      positionId: '430876',
      apiKey: 'test-api-key',
    })
    expect(await credentialStore.get(ethAddress)).toEqual(credentials)
  })

  it('signs the key seed once for the account step and the API-key step', async () => {
    const { deps } = setup([
      okAnswer({ key: 'test-api-key' }),
      accountInfoAnswer(signingKey.starkPublicKey),
    ])
    const signTypedData = vi.spyOn(wallet, 'signTypedData')

    await signOnboardingRequest(deps, wallet, ethAddress, onboardingStep())
    await registerExtendedApiKey(deps, wallet, ethAddress)

    // The key seed, then the registration: no second key seed.
    expect(signTypedData).toHaveBeenCalledTimes(2)
  })

  it('refuses an account that holds a different Stark key, and stores nothing', async () => {
    const { deps, credentialStore } = setup([
      okAnswer({ key: 'test-api-key' }),
      accountInfoAnswer('0x1234'),
    ])

    await expect(
      registerExtendedApiKey(deps, wallet, ethAddress)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(await credentialStore.get(ethAddress)).toBeNull()
  })
})
