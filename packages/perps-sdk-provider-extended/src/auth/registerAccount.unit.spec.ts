import { createMemoryStorage } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
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
  registerExtendedAccount,
} from './registerAccount.js'

const wallet = createWalletClient({
  account: privateKeyToAccount(`0x${starkFixtures.meta.ethPrivateKey}`),
  transport: http('http://127.0.0.1:1'),
})
const { ethAddress, frozenNow } = starkFixtures.meta
const [registration] = registrationCases
const [apiKeyRequest] = starkFixtures.apiRequestSignature

const onboardedAnswer = (l2Key: string) =>
  okAnswer({
    l1Address: ethAddress,
    defaultAccount: {
      id: 330870,
      accountIndex: 0,
      status: 'ACTIVE',
      l2Key,
      l2Vault: 430876,
    },
  })

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

describe('registerExtendedAccount', () => {
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

  it('sends the onboarding and API-key requests of the Python SDK, then stores the credentials', async () => {
    const { deps, requests, credentialStore } = setup([
      onboardedAnswer(signingKey.starkPublicKey),
      okAnswer({ key: 'test-api-key' }),
    ])

    const credentials = await registerExtendedAccount(deps, wallet, ethAddress)

    const [onboard, apiKey] = requests
    expect(onboard.url).toBe(`${DEFAULT_EXTENDED_API_URL}/auth/onboard`)
    expect(onboard.body).toEqual({
      ...registration.payload,
      accountCreation: {
        ...registration.payload.accountCreation,
        accountIndex: 0,
      },
    })
    expect(apiKey.url).toBe(`${DEFAULT_EXTENDED_API_URL}${apiKeyRequest.path}`)
    expect(apiKey.headers).toMatchObject({
      l1_signature: apiKeyRequest.signature,
      l1_message_time: apiKeyRequest.time,
      'x-x10-active-account': '330870',
    })
    expect(credentials).toEqual({
      starkPrivateKey: signingKey.starkPrivateKey,
      starkPublicKey: signingKey.starkPublicKey,
      accountId: '330870',
      positionId: '430876',
      apiKey: 'test-api-key',
    })
    expect(await credentialStore.get(ethAddress)).toEqual(credentials)
  })

  it('refuses an account that holds a different Stark key, and stores nothing', async () => {
    const { deps, requests, credentialStore } = setup([
      onboardedAnswer('0x1234'),
    ])

    await expect(
      registerExtendedAccount(deps, wallet, ethAddress)
    ).rejects.toMatchObject({ code: PerpsErrorCode.SDKError })
    expect(requests).toHaveLength(1)
    expect(await credentialStore.get(ethAddress)).toBeNull()
  })
})
