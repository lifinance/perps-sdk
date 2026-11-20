import { type PerpsClientSigner, PerpsError } from '@lifi/perps-sdk'
import {
  type Address,
  type Hex,
  PerpsErrorCode,
  type StarkActionStep,
  type StarkSignedActionStep,
} from '@lifi/perps-types'
import { getAddress, isAddressEqual } from 'viem'
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

interface StarkKeyPair {
  starkPrivateKey: Hex
  starkPublicKey: Hex
}

// The account step derives the key pair, and the API-key step of the same
// setup reuses it, so the wallet signs the key seed once per session.
const keyPairs = new WeakMap<
  ExtendedCredentialStore,
  Map<string, StarkKeyPair>
>()

const pendingKeyPairs = (store: ExtendedCredentialStore) => {
  const pending = keyPairs.get(store) ?? new Map<string, StarkKeyPair>()
  keyPairs.set(store, pending)
  return pending
}

async function deriveStarkKeyPair(
  deps: ExtendedRegistrationDeps,
  wallet: PerpsClientSigner,
  address: Address
): Promise<StarkKeyPair> {
  const pending = pendingKeyPairs(deps.credentialStore)
  const cached = pending.get(address.toLowerCase())
  if (cached !== undefined) {
    return cached
  }
  const keySeed = await wallet.signTypedData({
    account: wallet.account,
    ...buildAccountCreationTypedData(getAddress(address), deps.signingDomain),
  })
  const starkPrivateKey = await calculateStarkPrivateKey(keySeed)
  const keyPair = {
    starkPrivateKey,
    starkPublicKey: calculateStarkPublicKey(starkPrivateKey),
  }
  pending.set(address.toLowerCase(), keyPair)
  return keyPair
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const refuse = (message: string): never => {
  throw new PerpsError(PerpsErrorCode.SDKError, message)
}

/**
 * Sign the backend-built onboarding request of `address`: the wallet signs
 * the Stark key seed and the backend's `accountCreation`, and the Stark key
 * signs the wallet and its public key. The backend sends the request, so it
 * owns the referral code; the request needs no API key. The SDK refuses an
 * `accountCreation` that names another wallet, another action, or another
 * Extended host.
 *
 * @internal
 */
export async function signOnboardingRequest(
  deps: ExtendedRegistrationDeps,
  wallet: PerpsClientSigner,
  address: Address,
  step: StarkActionStep
): Promise<StarkSignedActionStep> {
  const { request } = step.stark
  const creation = request.body?.accountCreation
  const walletAddress = getAddress(address)
  if (
    !isRecord(creation) ||
    typeof creation.wallet !== 'string' ||
    !isAddressEqual(getAddress(creation.wallet), walletAddress) ||
    Number(creation.accountIndex) !== ACCOUNT_INDEX ||
    creation.tosAccepted !== true ||
    creation.action !== 'REGISTER' ||
    creation.host !== deps.baseUrl ||
    typeof creation.time !== 'string'
  ) {
    return refuse(
      'Extended onboarding request does not register this wallet on this Extended host.'
    )
  }
  const { starkPrivateKey, starkPublicKey } = await deriveStarkKeyPair(
    deps,
    wallet,
    address
  )
  const registration = buildAccountRegistrationTypedData(
    walletAddress,
    creation.time,
    deps.baseUrl,
    deps.signingDomain
  )
  const l1Signature = await wallet.signTypedData({
    account: wallet.account,
    ...registration,
  })
  return {
    action: step.action,
    stark: {
      request: {
        ...request,
        body: {
          ...request.body,
          l1Signature: withoutHexPrefix(l1Signature),
          l2Key: starkPublicKey,
          l2Signature: await signStarkHash(
            calculateStarkRegistrationHash(walletAddress, starkPublicKey),
            starkPrivateKey
          ),
        },
      },
      messages: step.stark.messages,
    },
  }
}

/**
 * Create an API key for the main account of `address` and store the
 * credentials. Extended ties a key created without an account header to the
 * wallet's account index 0; the SDK then reads the account with the new key.
 * On a new device the wallet signs the key seed again.
 *
 * @throws {PerpsError} `SDKError` when Extended holds a different Stark key
 *   for the account than the one the wallet signature gives.
 * @internal
 */
export async function registerExtendedApiKey(
  deps: ExtendedRegistrationDeps,
  wallet: PerpsClientSigner,
  address: Address
): Promise<ExtendedCredentials> {
  const { starkPrivateKey, starkPublicKey } = await deriveStarkKeyPair(
    deps,
    wallet,
    address
  )
  const time = formatSignatureTime(new Date())
  const signature = await wallet.signMessage({
    account: wallet.account,
    message: `${API_KEY_PATH}@${time}`,
  })
  const { key: apiKey } = await deps.client.send<{ key: string }>(
    'POST',
    API_KEY_PATH,
    {
      body: { description: EXTENDED_API_KEY_DESCRIPTION },
      headers: {
        L1_SIGNATURE: withoutHexPrefix(signature),
        L1_MESSAGE_TIME: time,
      },
    }
  )
  const account = await deps.client.send<{
    accountId: number | string
    l2Vault: number | string
    l2Key: string
  }>('GET', '/api/v1/user/account/info', { apiKey })
  if (BigInt(account.l2Key) !== BigInt(starkPublicKey)) {
    return refuse(
      'Extended holds a different Stark key for this account than the wallet signature gives.'
    )
  }
  const credentials: ExtendedCredentials = {
    starkPrivateKey,
    starkPublicKey,
    accountId: String(account.accountId),
    positionId: String(account.l2Vault),
    apiKey,
  }
  await deps.credentialStore.set(address, credentials)
  pendingKeyPairs(deps.credentialStore).delete(address.toLowerCase())
  return credentials
}
