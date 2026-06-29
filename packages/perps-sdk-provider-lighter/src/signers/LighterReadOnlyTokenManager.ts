import {
  localStorageAdapter,
  PerpsError,
  readValidatedRecord,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import type {
  ApproveReadOnlyTokenParams,
  LighterAccountConfig,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { DEFAULT_LIGHTER_REST_URL } from '../constants.js'

const STORAGE_PREFIX = 'lifi:perps:lighter:rotoken'

/**
 * Default Lighter HTTP host the SDK posts the create request to. Callers
 * pointing at testnet pass an override via {@link LighterReadOnlyTokenManagerOptions.lighterApiUrl}.
 * @public
 */
export const DEFAULT_LIGHTER_API_URL = DEFAULT_LIGHTER_REST_URL

/**
 * Default token name persisted alongside Lighter's `tokens/create` row.
 * Lighter requires a non-empty `name` form field; the literal here is what
 * surfaces in Lighter's UI listing under `app.lighter.xyz/read-only-tokens`.
 * @public
 */
export const DEFAULT_READ_ONLY_TOKEN_NAME = 'LI.FI Perps'

/**
 * Persisted shape of a Lighter read-only token. The `token` string is
 * Lighter's opaque `ro:{accountIndex}:{scope}:{expiry}:{rand}` bearer; the
 * SDK never parses it — `expiry`/`scope`/`accountIndex` are create-time inputs
 * we keep alongside so consumers can render expiry UX without re-fetching.
 * @public
 */
export interface LighterReadOnlyToken {
  /** Opaque bearer string — never parse client-side. */
  token: string
  /** Unix seconds. The SDK's source of truth for expiry. */
  expiry: number
  /** Lighter's `single | all` scope literal recorded at create time. */
  scope: 'single' | 'all'
  /** Lighter L2 account index the token authorises. */
  accountIndex: number
}

/**
 * Lighter `POST /api/v1/tokens/create` response shape (subset). Lighter's
 * OpenAPI documents additional fields (`token_id`, `name`, `revoked`, etc.)
 * we don't need client-side.
 * @public
 */
export interface LighterCreateTokenResponse {
  api_token: string
  account_index: number
  expiry: number
  scopes: string
}

/**
 * Function injected for the HTTP boundary against Lighter's `tokens/create`
 * endpoint. Returning a parsed {@link LighterCreateTokenResponse} keeps the
 * create code free of fetch/multipart plumbing and lets tests drop a fixture
 * in without spinning a mock server.
 * @public
 */
export type LighterTokenFetcher = (params: {
  url: string
  authorization: string
  name: string
  accountIndex: number
  expiry: number
  subAccountAccess: boolean
  scopes: string
}) => Promise<LighterCreateTokenResponse>

/** @public */
export interface LighterReadOnlyTokenManagerOptions {
  storage?: StorageAdapter
  /** Lighter API host. Defaults to {@link DEFAULT_LIGHTER_API_URL}. */
  lighterApiUrl?: string
  /** Override the multipart POST. Defaults to a `fetch`-based implementation. */
  fetcher?: LighterTokenFetcher
  /** Clock injection for testing expiry logic. Defaults to `Date.now`. */
  now?: () => number
}

/** @public */
export interface ApproveReadOnlyTokenInputs extends ApproveReadOnlyTokenParams {
  /** L1 wallet address that signs the create message. */
  address: Address
}

/** @public */
export interface ApproveReadOnlyTokenResult {
  token: LighterReadOnlyToken
  /** Projection of the post-create Lighter account state. */
  config: Pick<
    LighterAccountConfig,
    | 'provider'
    | 'accountIndex'
    | 'readOnlyTokenApproved'
    | 'readOnlyTokenExpiry'
    | 'readOnlyTokenScope'
  >
}

const SECONDS_PER_DAY = 86_400

const isLighterReadOnlyToken = (
  value: unknown
): value is LighterReadOnlyToken => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { token, expiry, scope, accountIndex } = value as Record<
    string,
    unknown
  >
  return (
    typeof token === 'string' &&
    token.length > 0 &&
    typeof expiry === 'number' &&
    Number.isFinite(expiry) &&
    (scope === 'single' || scope === 'all') &&
    typeof accountIndex === 'number' &&
    Number.isFinite(accountIndex)
  )
}

/**
 * Manage the per-account Lighter read-only token alongside the existing
 * `(L1 address, account index)`-scoped storage adapter pattern. Takes an
 * injectable `StorageAdapter` so callers can share one storage backend across
 * the SDK's session stores. The token is opaque — never parsed client-side;
 * `expiry`/`scope` recorded at create time are the source of truth.
 *
 * The L1 wallet signer and the HTTP fetcher are both injectable so unit
 * tests don't need a real wallet or network.
 * @public
 */
export class LighterReadOnlyTokenManager {
  private readonly storage: StorageAdapter
  private readonly lighterApiUrl: string
  private readonly fetcher: LighterTokenFetcher
  private readonly now: () => number
  private readonly cache = new Map<string, LighterReadOnlyToken>()

  constructor(options: LighterReadOnlyTokenManagerOptions = {}) {
    this.storage = options.storage ?? localStorageAdapter
    this.lighterApiUrl = options.lighterApiUrl ?? DEFAULT_LIGHTER_API_URL
    this.fetcher = options.fetcher ?? defaultLighterTokenFetcher
    this.now = options.now ?? (() => Date.now())
  }

  private storageKey(address: Address, accountIndex: number): string {
    return `${STORAGE_PREFIX}:${address.toLowerCase()}:${accountIndex}`
  }

  private isExpired(token: LighterReadOnlyToken): boolean {
    return token.expiry * 1000 <= this.now()
  }

  /**
   * Return the stored token for the `(address, accountIndex)` pair, or
   * `undefined` if absent or past its `expiry`. Never surfaces an expired
   * token — consumers can rely on the return value being usable as-is.
   */
  async get(
    address: Address,
    accountIndex: number
  ): Promise<LighterReadOnlyToken | undefined> {
    const key = this.storageKey(address, accountIndex)
    const cached = this.cache.get(key)
    if (cached) {
      return this.isExpired(cached) ? undefined : cached
    }
    const parsed = await readValidatedRecord(
      this.storage,
      key,
      isLighterReadOnlyToken
    )
    if (!parsed || this.isExpired(parsed)) {
      return undefined
    }
    this.cache.set(key, parsed)
    return parsed
  }

  /**
   * `true` when a stored token exists AND its `expiry` falls within
   * `thresholdDays` of now. `false` when no token exists, when the token is
   * already expired (caller should treat that as "no token"), or when it
   * has more than `thresholdDays` of life left.
   */
  async isReadOnlyTokenExpiringSoon(
    address: Address,
    accountIndex: number,
    thresholdDays = 30
  ): Promise<boolean> {
    const key = this.storageKey(address, accountIndex)
    const token =
      this.cache.get(key) ??
      (await readValidatedRecord(this.storage, key, isLighterReadOnlyToken))
    if (!token) {
      return false
    }
    const remainingSeconds = token.expiry - Math.floor(this.now() / 1000)
    if (remainingSeconds <= 0) {
      return false
    }
    return remainingSeconds <= thresholdDays * SECONDS_PER_DAY
  }

  /**
   * Persist `token` for the `(address, accountIndex)` pair. Overwrites any
   * prior stored token under the same key — used both by the approve flow
   * and by the renewal flow.
   */
  async set(
    address: Address,
    accountIndex: number,
    token: LighterReadOnlyToken
  ): Promise<void> {
    const key = this.storageKey(address, accountIndex)
    this.cache.set(key, token)
    await this.storage.set(key, JSON.stringify(token))
  }

  async remove(address: Address, accountIndex: number): Promise<void> {
    const key = this.storageKey(address, accountIndex)
    this.cache.delete(key)
    await this.storage.remove(key)
  }

  /**
   * Create and persist a new Lighter read-only token.
   *
   * POSTs to Lighter's `/api/v1/tokens/create` (via the injected `fetcher`)
   * and persists the returned `ro:` bearer alongside its
   * `expiry`/`scope`/`accountIndex`.
   *
   * `authorization` MUST be a **standard** Lighter auth token — one created by
   * the account's API key (`createAuthToken` / the WASM signer), NOT an L1
   * wallet signature. Lighter authenticates the create request with that token
   * and rejects anything else as `invalid auth string` (code 20013).
   *
   * `expirySeconds` is the absolute unix-seconds expiry Lighter records on
   * the row. Lighter enforces 1 day ≤ lifetime ≤ 10 years server-side; the
   * SDK does NOT pre-validate and surfaces Lighter's 400 verbatim.
   *
   * `scope` selects sub-account coverage: `'all'` sets `sub_account_access`
   * (read access to every sub-account of the owner); `'single'` scopes to the
   * one account. The permission set (`scopes` form field) is always read-only
   * (`read.*`).
   *
   * @param authorization Standard (API-key-signed) Lighter auth token.
   * @param inputs Token-create parameters plus the owning `address`.
   */
  async approve(
    authorization: string,
    inputs: ApproveReadOnlyTokenInputs
  ): Promise<ApproveReadOnlyTokenResult> {
    const { address, accountIndex, expirySeconds, scope } = inputs

    const response = await this.fetcher({
      url: `${this.lighterApiUrl}/api/v1/tokens/create`,
      authorization,
      name: DEFAULT_READ_ONLY_TOKEN_NAME,
      accountIndex,
      expiry: expirySeconds,
      subAccountAccess: scope === 'all',
      scopes: 'read.*',
    })

    const token: LighterReadOnlyToken = {
      token: response.api_token,
      expiry: response.expiry,
      // Persist the values we requested, not Lighter's echoed ones: `scope`
      // keeps the typed discriminator, and `accountIndex` must match the key
      // `get()` looks up by, else a divergent echo orphans the token and re-creates every read.
      scope,
      accountIndex,
    }
    await this.set(address, token.accountIndex, token)

    return {
      token,
      config: {
        provider: 'lighter',
        accountIndex: token.accountIndex,
        readOnlyTokenApproved: true,
        readOnlyTokenExpiry: token.expiry,
        readOnlyTokenScope: token.scope,
      },
    }
  }
}

/**
 * Default fetcher: posts a multipart/form-data request to Lighter's
 * `tokens/create` endpoint and returns the parsed response. Throws a
 * {@link PerpsError} with the Lighter-side body when the response is
 * non-2xx.
 * @public
 */
export const defaultLighterTokenFetcher: LighterTokenFetcher = async ({
  url,
  authorization,
  name,
  accountIndex,
  expiry,
  subAccountAccess,
  scopes,
}) => {
  const form = new FormData()
  form.set('name', name)
  form.set('account_index', String(accountIndex))
  form.set('expiry', String(expiry))
  form.set('sub_account_access', String(subAccountAccess))
  form.set('scopes', scopes)

  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization },
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new PerpsError(
      PerpsErrorCode.ServerError,
      `Lighter tokens/create returned ${response.status}: ${body || '<empty>'}`
    )
  }

  return (await response.json()) as LighterCreateTokenResponse
}
