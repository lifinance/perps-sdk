import type { LighterApiKey } from './LighterKeyStore.js'
import type { LighterReadOnlyToken } from './LighterReadOnlyTokenManager.js'
import type { LighterSigner } from './LighterSigner.js'

const DEFAULT_LIFETIME_SECONDS = 60 * 60
const DEFAULT_THRESHOLD_SECONDS = 30 * 86_400

/**
 * Inputs for creating a standard Lighter auth token. The signer and API-key
 * fields identify the registered Lighter account; `lifetimeSeconds` is capped
 * by Lighter's token policy and defaults to one hour.
 *
 * @public
 */
export interface CreateAuthTokenInputs {
  signer: LighterSigner
  apiKey: Pick<
    LighterApiKey,
    'apiKeyPrivateKey' | 'apiKeyIndex' | 'accountIndex'
  >
  /**
   * Token lifetime in seconds. Lighter caps standard tokens at 8 hours.
   * Defaults to 1 hour, matching the previous `PerpsClient` behaviour.
   */
  lifetimeSeconds?: number
  now?: () => number
}

/**
 * Create a fresh Lighter standard auth token via the WASM signer. Returns the
 * opaque bearer string Lighter will accept on its authenticated read
 * endpoints (`getOrders`, `getOrder`, `getActivity`, etc.).
 *
 * This utility carries no SDK-wide coupling — pass an explicit `signer` +
 * `apiKey` and consume the returned bearer however the caller likes
 * (per-call `options.lighterAuthToken`, persisted cache, etc.).
 * @public
 */
export async function createAuthToken(
  inputs: CreateAuthTokenInputs
): Promise<string> {
  const { signer, apiKey } = inputs
  const lifetime = inputs.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS
  const now = inputs.now ?? (() => Date.now())
  const deadline = Math.floor(now() / 1000) + lifetime
  return signer.createAuthToken(deadline, {
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  })
}

/**
 * True when `token` exists, has not already expired, and is within
 * `thresholdSeconds` of its recorded `expiry`. Intended for widget renewal
 * banners — `thresholdSeconds` defaults to 30 days. Returns `false` for an
 * undefined or already-expired token, so callers may treat that as "no
 * token / renewal not needed (yet)".
 * @public
 */
export function isReadOnlyTokenExpiringSoon(
  token: LighterReadOnlyToken | undefined | null,
  thresholdSeconds: number = DEFAULT_THRESHOLD_SECONDS,
  now: () => number = () => Date.now()
): boolean {
  if (!token) {
    return false
  }
  const remaining = token.expiry - Math.floor(now() / 1000)
  if (remaining <= 0) {
    return false
  }
  return remaining <= thresholdSeconds
}
