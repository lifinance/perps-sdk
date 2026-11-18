import { type PerpsClientSigner, PerpsError } from '@lifi/perps-sdk'
import { type Address, PerpsErrorCode } from '@lifi/perps-types'
import { getAddress } from 'viem'
import { EXTENDED_API_KEY_DESCRIPTION } from '../constants.js'
import {
  calculateStarkPrivateKey,
  calculateStarkPublicKey,
  signStarkHash,
} from '../signing/starkKey.js'
import { calculateStarkRegistrationHash } from '../signing/starkMessageHash.js'
import type { ExtendedApiClient } from '../utils/apiClient.js'
import type {
  ExtendedCredentialStore,
  ExtendedCredentials,
} from './ExtendedCredentialStore.js'

const API_KEY_PATH = '/api/v1/user/account/api-key'

/** @internal */
export interface ExtendedRegistrationDeps {
  client: ExtendedApiClient
  credentialStore: ExtendedCredentialStore
  /** Extended host, signed into the registration as `host`. */
  baseUrl: string
  signingDomain: string
}

interface OnboardedAccount {
  defaultAccount: {
    id: number | string
    l2Vault: number | string
    l2Key: string
  }
}

/** Format a time as Extended signs it: UTC, whole seconds. @internal */
export const formatSignatureTime = (date: Date): string =>
  `${date.toISOString().slice(0, 19)}Z`

const ACCOUNT_INDEX = 0

/**
 * Typed data whose wallet signature seeds the Stark key. The same wallet
 * always signs the same data, so the key is recoverable on any device.
 *
 * @internal
 */
export const buildAccountCreationTypedData = (
  wallet: Address,
  signingDomain: string
) =>
  ({
    domain: { name: signingDomain },
    primaryType: 'AccountCreation',
    types: {
      AccountCreation: [
        { name: 'accountIndex', type: 'int8' },
        { name: 'wallet', type: 'address' },
        { name: 'tosAccepted', type: 'bool' },
      ],
    },
    message: { accountIndex: ACCOUNT_INDEX, wallet, tosAccepted: true },
  }) as const

/** @internal */
export const buildAccountRegistrationTypedData = (
  wallet: Address,
  time: string,
  host: string,
  signingDomain: string
) =>
  ({
    domain: { name: signingDomain },
    primaryType: 'AccountRegistration',
    types: {
      AccountRegistration: [
        { name: 'accountIndex', type: 'int8' },
        { name: 'wallet', type: 'address' },
        { name: 'tosAccepted', type: 'bool' },
        { name: 'time', type: 'string' },
        { name: 'action', type: 'string' },
        { name: 'host', type: 'string' },
      ],
    },
    message: {
      accountIndex: ACCOUNT_INDEX,
      wallet,
      tosAccepted: true,
      time,
      action: 'REGISTER',
      host,
    },
  }) as const

const withoutHexPrefix = (signature: string): string =>
  signature.replace(/^0x/, '')

/**
 * Create the Extended account of `address`, or recover it, and store its
 * credentials. The wallet signs three times: the Stark key seed, the account
 * registration, and the API-key request. Onboarding an existing account gives
 * that account again, so this also restores the credentials on a new device.
 *
 * @throws {PerpsError} `SDKError` when Extended holds a different Stark key
 *   for the account than the one the wallet signature gives.
 * @internal
 */
export async function registerExtendedAccount(
  deps: ExtendedRegistrationDeps,
  wallet: PerpsClientSigner,
  address: Address
): Promise<ExtendedCredentials> {
  const walletAddress = getAddress(address)
  const keySeed = await wallet.signTypedData({
    account: wallet.account,
    ...buildAccountCreationTypedData(walletAddress, deps.signingDomain),
  })
  const starkPrivateKey = await calculateStarkPrivateKey(keySeed)
  const starkPublicKey = calculateStarkPublicKey(starkPrivateKey)

  const registrationTime = formatSignatureTime(new Date())
  const registration = buildAccountRegistrationTypedData(
    walletAddress,
    registrationTime,
    deps.baseUrl,
    deps.signingDomain
  )
  const l1Signature = await wallet.signTypedData({
    account: wallet.account,
    ...registration,
  })
  const onboarded = await deps.client.send<OnboardedAccount>(
    'POST',
    '/auth/onboard',
    {
      body: {
        l1Signature: withoutHexPrefix(l1Signature),
        l2Key: starkPublicKey,
        l2Signature: await signStarkHash(
          calculateStarkRegistrationHash(walletAddress, starkPublicKey),
          starkPrivateKey
        ),
        accountCreation: registration.message,
        referralCode: null,
      },
    }
  )
  const account = onboarded.defaultAccount
  if (BigInt(account.l2Key) !== BigInt(starkPublicKey)) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended holds a different Stark key for this account than the wallet signature gives.'
    )
  }

  const apiKeyTime = formatSignatureTime(new Date())
  const apiKeySignature = await wallet.signMessage({
    account: wallet.account,
    message: `${API_KEY_PATH}@${apiKeyTime}`,
  })
  const created = await deps.client.send<{ key: string }>(
    'POST',
    API_KEY_PATH,
    {
      body: { description: EXTENDED_API_KEY_DESCRIPTION },
      headers: {
        L1_SIGNATURE: withoutHexPrefix(apiKeySignature),
        L1_MESSAGE_TIME: apiKeyTime,
        'X-X10-ACTIVE-ACCOUNT': String(account.id),
      },
    }
  )

  const credentials: ExtendedCredentials = {
    starkPrivateKey,
    starkPublicKey,
    accountId: String(account.id),
    positionId: String(account.l2Vault),
    apiKey: created.key,
  }
  await deps.credentialStore.set(address, credentials)
  return credentials
}
