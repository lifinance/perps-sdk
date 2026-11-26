import {
  createWarnOnce,
  type PerpsClientSigner,
  PerpsError,
} from '@lifi/perps-sdk'
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
const API_KEYS_PATH = '/api/v1/user/account/api-keys'
const REFERRAL_USE_PATH = '/api/v1/referrals/use'

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

/** The wallet signs `path@time` for an account request without an API key. */
async function l1SignatureHeaders(
  wallet: PerpsClientSigner,
  path: string
): Promise<Record<string, string>> {
  const time = formatSignatureTime(new Date())
  const signature = await wallet.signMessage({
    account: wallet.account,
    message: `${path}@${time}`,
  })
  return {
    L1_SIGNATURE: withoutHexPrefix(signature),
    L1_MESSAGE_TIME: time,
  }
}

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

// The account step reads the backend's referral code, and the API-key step of
// the same setup uses it for an account that onboarding did not refer.
const referralCodes = new WeakMap<
  ExtendedCredentialStore,
  Map<string, string>
>()

const pendingReferralCodes = (store: ExtendedCredentialStore) => {
  const pending = referralCodes.get(store) ?? new Map<string, string>()
  referralCodes.set(store, pending)
  return pending
}

const warnReferral = createWarnOnce()

/**
 * Attach the account to the referral code. Extended refuses an account that
 * already has a referrer; that and any other failure leave the setup as it is.
 */
async function useReferralCode(
  deps: ExtendedRegistrationDeps,
  apiKey: string,
  code: string
): Promise<void> {
  try {
    await deps.client.send('POST', REFERRAL_USE_PATH, {
      apiKey,
      body: { code },
    })
  } catch (error) {
    warnReferral(
      REFERRAL_USE_PATH,
      `[extended] referral code not attached: ${error instanceof Error ? error.message : String(error)}`
    )
  }
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

const isVenueInteger = (value: unknown): value is number | string =>
  (typeof value === 'number' && Number.isSafeInteger(value)) ||
  (typeof value === 'string' && /^\d+$/.test(value))

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
    String(creation.accountIndex) !== String(ACCOUNT_INDEX) ||
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
  const referralCode = request.body?.referralCode
  if (typeof referralCode === 'string' && referralCode !== '') {
    pendingReferralCodes(deps.credentialStore).set(
      address.toLowerCase(),
      referralCode
    )
  }
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
 * On a new device the wallet signs the key seed again. When the account step
 * of the same setup carried a referral code, the SDK then attaches the account
 * to it (`POST /api/v1/referrals/use`), for an account that onboarding did not
 * refer. A failure there does not fail the setup.
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
  const { key: apiKey } = await deps.client.send<{ key: string }>(
    'POST',
    API_KEY_PATH,
    {
      body: { description: EXTENDED_API_KEY_DESCRIPTION },
      headers: await l1SignatureHeaders(wallet, API_KEY_PATH),
      secretResponse: true,
    }
  )
  const account = await deps.client.send<{
    accountId: unknown
    l2Vault: unknown
    l2Key: unknown
  }>('GET', '/api/v1/user/account/info', { apiKey })
  if (
    !isVenueInteger(account.accountId) ||
    !isVenueInteger(account.l2Vault) ||
    typeof account.l2Key !== 'string' ||
    !/^(0x[0-9a-f]+|\d+)$/i.test(account.l2Key)
  ) {
    return refuse(
      'Extended account info has no valid account id, position or Stark key.'
    )
  }
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
  const referrals = pendingReferralCodes(deps.credentialStore)
  const referralCode = referrals.get(address.toLowerCase())
  if (referralCode !== undefined) {
    referrals.delete(address.toLowerCase())
    await useReferralCode(deps, apiKey, referralCode)
  }
  return credentials
}

const isApiKeyId = (value: unknown): value is number | string =>
  (typeof value === 'number' && Number.isSafeInteger(value)) ||
  (typeof value === 'string' && /^[\w-]+$/.test(value))

/**
 * Delete each API key of the main account of `address` that this SDK created,
 * then remove the stored credentials. The wallet signs the key list and each
 * delete. Keys that other apps created stay. The SDK checks every id before
 * it deletes a key, so a malformed list deletes nothing.
 *
 * @throws {PerpsError} `SDKError` when the list is not a list, or names an
 *   SDK key without a valid id.
 * @internal
 */
export async function revokeExtendedApiKeys(
  deps: ExtendedRegistrationDeps,
  wallet: PerpsClientSigner,
  address: Address
): Promise<void> {
  const keys = await deps.client.send<unknown>('GET', API_KEYS_PATH, {
    headers: await l1SignatureHeaders(wallet, API_KEYS_PATH),
    secretResponse: true,
  })
  if (!Array.isArray(keys)) {
    return refuse('Extended answered the API key list without a list.')
  }
  const ids = keys.flatMap((key) =>
    isRecord(key) && key.description === EXTENDED_API_KEY_DESCRIPTION
      ? [key.id]
      : []
  )
  if (!ids.every(isApiKeyId)) {
    return refuse('Extended lists an API key of this SDK without a valid id.')
  }
  for (const id of ids) {
    const path = `${API_KEY_PATH}/${id}`
    await deps.client.send('DELETE', path, {
      headers: await l1SignatureHeaders(wallet, path),
    })
  }
  await deps.credentialStore.remove(address)
}
