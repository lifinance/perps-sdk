import {
  localStorageAdapter,
  PerpsError,
  readValidatedRecord,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import type {
  ApproveReadOnlyTokenParams,
  LighterAccountConfig,
  LighterProviderKey,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address } from 'viem'
import { DEFAULT_LIGHTER_REST_URL, LIGHTER_PROVIDER_KEY } from '../constants.js'

/**
 * Default token name persisted alongside Lighter's `tokens/create` row.
 * Lighter requires a non-empty `name` form field; the literal here is what
 * surfaces in Lighter's UI listing under `app.lighter.xyz/read-only-tokens`.
 * @internal
 */
export const DEFAULT_READ_ONLY_TOKEN_NAME = 'LI.FI Perps'

/**
 * Persisted shape of a Lighter read-only token. The `token` string is
 * Lighter's opaque `ro:{accountIndex}:{scope}:{expiry}:{rand}` bearer; the
 * SDK never parses it — `expiry`/`scope`/`accountIndex` are create-time inputs
 * we keep alongside so consumers can render expiry UX without re-fetching.
 * @internal
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
  /**
   * Lighter's monotonic registry row id. Optional: a record persisted without
   * it stays valid, and the cleanup pass then identifies its row by the
   * bearer string instead.
   */
  tokenId?: number
}

/**
 * Lighter `POST /api/v1/tokens/create` response shape — the subset of
 * Lighter's `RespPostApiToken` the SDK consumes. Lighter documents further
 * fields (`name`, `revoked`, `sub_account_access`) the SDK does not need.
 * @internal
 */
export interface LighterCreateTokenResponse {
  api_token: string
  account_index: number
  expiry: number
  scopes: string
  /** Monotonic registry row id Lighter assigns to the new row. */
  token_id: number
}

/**
 * Function injected for the HTTP boundary against Lighter's `tokens/create`
 * endpoint. Returning a parsed {@link LighterCreateTokenResponse} keeps the
 * create code free of fetch/multipart plumbing and lets tests drop a fixture
 * in without spinning a mock server.
 * @internal
 */
export type LighterTokenFetcher = (params: {
  url: string
  authorization: string
  name: string
  accountIndex: number
  expiry: number
  subAccountAccess: boolean
  scopes: string
  fetchImpl?: typeof fetch
}) => Promise<LighterCreateTokenResponse>

/**
 * One row of Lighter's read-only token registry, matching Lighter's
 * `ApiToken`. `name` carries the label supplied at create time, which is how
 * the SDK recognises a row it owns.
 * @internal
 */
export interface LighterApiToken {
  token_id: number
  api_token: string
  name: string
  account_index: number
  expiry: number
  sub_account_access: boolean
  revoked: boolean
  scopes: string
}

/**
 * Lighter `GET /api/v1/tokens` response shape, matching `RespGetApiTokens`.
 * @internal
 */
export interface LighterListTokensResponse {
  code: number
  message?: string
  api_tokens: LighterApiToken[]
}

/**
 * Lighter `POST /api/v1/tokens/revoke` response shape, matching Lighter's
 * `RespRevokeApiToken`.
 * @internal
 */
export interface LighterRevokeTokenResponse {
  code: number
  message?: string
  token_id: number
  revoked: boolean
}

/**
 * Function injected for the HTTP boundary against Lighter's
 * `GET /api/v1/tokens` endpoint. Injected for the same reason as
 * {@link LighterTokenFetcher}: a unit spec supplies a registry fixture
 * without a mock server.
 * @internal
 */
export type LighterTokenListFetcher = (params: {
  url: string
  authorization: string
  accountIndex: number
  fetchImpl?: typeof fetch
}) => Promise<LighterListTokensResponse>

/**
 * Function injected for the HTTP boundary against Lighter's
 * `POST /api/v1/tokens/revoke` endpoint.
 * @internal
 */
export type LighterTokenRevokeFetcher = (params: {
  url: string
  authorization: string
  tokenId: number
  accountIndex: number
  fetchImpl?: typeof fetch
}) => Promise<LighterRevokeTokenResponse>

/**
 * Dependencies and overrides for {@link LighterReadOnlyTokenManager}.
 * Storage and token-fetching defaults target the browser's local storage and
 * Lighter's mainnet REST API.
 *
 * @internal
 */
export interface LighterReadOnlyTokenManagerOptions {
  storage?: StorageAdapter
  /**
   * Provider instance key. Namespaces persisted tokens so two Lighter
   * instances sharing a storage backend never serve each other's token for a
   * coincident `(address, accountIndex)` pair, and stamps the `provider` of
   * the {@link ApproveReadOnlyTokenResult} config. Defaults to `'lighter'`.
   */
  providerKey?: LighterProviderKey
  /** Lighter API host. Defaults to {@link DEFAULT_LIGHTER_REST_URL}. */
  lighterApiUrl?: string
  /** Override the multipart POST. Defaults to a `fetch`-based implementation. */
  fetcher?: LighterTokenFetcher
  /** Override the registry list GET. Defaults to a `fetch`-based implementation. */
  listFetcher?: LighterTokenListFetcher
  /** Override the revoke POST. Defaults to a `fetch`-based implementation. */
  revokeFetcher?: LighterTokenRevokeFetcher
  /** Transport used by the default endpoint fetchers. Defaults to `fetch`. */
  fetchImpl?: typeof fetch
  /** Clock injection for testing expiry logic. Defaults to `Date.now`. */
  now?: () => number
}

/**
 * Input to the read-only-token approval flow. Extends the shared approval
 * parameters with the L1 address whose wallet authorizes token creation.
 *
 * @internal
 */
export interface ApproveReadOnlyTokenInputs extends ApproveReadOnlyTokenParams {
  /** L1 wallet address that signs the create message. */
  address: Address
}

/**
 * Result of approving or creating a Lighter read-only token. `config` is the
 * account-state projection callers can persist alongside the token.
 *
 * @internal
 */
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
  const { token, expiry, scope, accountIndex, tokenId } = value as Record<
    string,
    unknown
  >
  // Accept a record that carries no `tokenId`: rejecting one would discard a
  // usable token and force an unnecessary replacement.
  return (
    typeof token === 'string' &&
    token.length > 0 &&
    typeof expiry === 'number' &&
    Number.isFinite(expiry) &&
    (scope === 'single' || scope === 'all') &&
    typeof accountIndex === 'number' &&
    Number.isFinite(accountIndex) &&
    (tokenId === undefined ||
      (typeof tokenId === 'number' && Number.isFinite(tokenId)))
  )
}

const isLiveRow = (
  row: LighterApiToken,
  live: LighterReadOnlyToken | undefined
): boolean =>
  live !== undefined &&
  (row.token_id === live.tokenId || row.api_token === live.token)

/**
 * Manage the per-account Lighter read-only token alongside the existing
 * `(L1 address, account index)`-scoped storage adapter pattern. Takes an
 * injectable `StorageAdapter` so callers can share one storage backend across
 * the SDK's session stores. The token is opaque — never parsed client-side;
 * `expiry`/`scope` recorded at create time are the source of truth.
 *
 * The L1 wallet signer and the HTTP fetcher are both injectable so unit
 * tests don't need a real wallet or network.
 *
 * @security The default adapter encrypts records at rest (AES-GCM-256 via
 * WebCrypto, keyed by a non-extractable key held in IndexedDB) before writing
 * ciphertext to `localStorage`, defeating generic storage/disk scanning and raw
 * token exfiltration. It does not defend against malware targeting this SDK or
 * a fully compromised page — a same-origin script can still drive this manager
 * to decrypt. Blast radius is limited to reads: the token cannot sign orders
 * or move funds.
 * @internal
 */
export class LighterReadOnlyTokenManager {
  private readonly storage: StorageAdapter
  private readonly providerKey: LighterProviderKey
  private readonly lighterApiUrl: string
  private readonly fetcher: LighterTokenFetcher
  private readonly listFetcher: LighterTokenListFetcher
  private readonly revokeFetcher: LighterTokenRevokeFetcher
  private readonly fetchImpl: typeof fetch | undefined
  private readonly now: () => number
  private readonly cache = new Map<string, LighterReadOnlyToken>()

  constructor(options: LighterReadOnlyTokenManagerOptions = {}) {
    this.storage = options.storage ?? localStorageAdapter
    this.providerKey = options.providerKey ?? LIGHTER_PROVIDER_KEY
    this.lighterApiUrl = options.lighterApiUrl ?? DEFAULT_LIGHTER_REST_URL
    this.fetcher = options.fetcher ?? defaultLighterTokenFetcher
    this.listFetcher = options.listFetcher ?? defaultLighterTokenListFetcher
    this.revokeFetcher =
      options.revokeFetcher ?? defaultLighterTokenRevokeFetcher
    this.fetchImpl = options.fetchImpl
    this.now = options.now ?? (() => Date.now())
  }

  private storageKey(address: Address, accountIndex: number): string {
    return `lifi:perps:${this.providerKey}:rotoken:${address.toLowerCase()}:${accountIndex}`
  }

  private isExpired(token: LighterReadOnlyToken): boolean {
    return token.expiry * 1000 <= this.now()
  }

  /** Stored record for the pair, whether or not it is past its `expiry`. */
  private async readStoredToken(
    address: Address,
    accountIndex: number
  ): Promise<LighterReadOnlyToken | undefined> {
    const key = this.storageKey(address, accountIndex)
    return (
      this.cache.get(key) ??
      (await readValidatedRecord(this.storage, key, isLighterReadOnlyToken)) ??
      undefined
    )
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
    const token = await this.readStoredToken(address, accountIndex)
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

  /**
   * Remove the stored token for an `(address, accountIndex)` pair and clear
   * the corresponding cache entry.
   */
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
   * Before the create call, the flow revokes this SDK's own stale registry
   * rows. That pass is best-effort: a failure is logged and the create runs.
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
    await this.revokeStaleOwnTokens(
      authorization,
      inputs.address,
      inputs.accountIndex
    )
    return this.createAndPersist(authorization, inputs)
  }

  /**
   * Replace a token that Lighter explicitly reports as revoked.
   * The venue already revoked the row, so this path skips registry cleanup.
   */
  async replaceRevoked(
    authorization: string,
    inputs: ApproveReadOnlyTokenInputs
  ): Promise<ApproveReadOnlyTokenResult> {
    await this.remove(inputs.address, inputs.accountIndex)
    return this.createAndPersist(authorization, inputs)
  }

  private async createAndPersist(
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
      fetchImpl: this.fetchImpl,
    })

    const token: LighterReadOnlyToken = {
      token: response.api_token,
      expiry: response.expiry,
      // Persist the values we requested, not Lighter's echoed ones: `scope`
      // keeps the typed discriminator, and `accountIndex` must match the key
      // `get()` looks up by, else a divergent echo orphans the token and re-creates every read.
      scope,
      accountIndex,
      // Lighter declares `token_id` required but the response is unvalidated.
      // A non-numeric id must degrade to the bearer-string match: persisting it
      // would fail record validation and re-create the token on every read.
      tokenId: Number.isFinite(response.token_id)
        ? response.token_id
        : undefined,
    }
    await this.set(address, token.accountIndex, token)

    return {
      token,
      config: {
        provider: this.providerKey,
        accountIndex: token.accountIndex,
        readOnlyTokenApproved: true,
        readOnlyTokenExpiry: token.expiry,
        readOnlyTokenScope: token.scope,
      },
    }
  }

  /**
   * Revoke the registry rows this SDK owns and no longer needs. Lighter's
   * `tokens/create` appends a row on every call, so without this pass the
   * user's registry grows on every rotation.
   */
  private async revokeStaleOwnTokens(
    authorization: string,
    address: Address,
    accountIndex: number
  ): Promise<void> {
    try {
      const live = await this.readStoredToken(address, accountIndex)
      const { api_tokens: rows } = await this.listFetcher({
        url: `${this.lighterApiUrl}/api/v1/tokens`,
        authorization,
        accountIndex,
        fetchImpl: this.fetchImpl,
      })
      const nowSeconds = Math.floor(this.now() / 1000)
      const stale = rows
        // A row is ours only when its name matches the name we create rows
        // under. Any other name belongs to the user and must survive.
        .filter((row) => row.name === DEFAULT_READ_ONLY_TOKEN_NAME)
        .filter((row) => !row.revoked)
        // Keep the row the local store holds; with no stored record every owned
        // row is stale, and a peer client's row self-heals via `retryOnRevoked`.
        .filter((row) => row.expiry <= nowSeconds || !isLiveRow(row, live))
        .sort((a, b) => a.token_id - b.token_id)

      for (const row of stale) {
        try {
          await this.revokeFetcher({
            url: `${this.lighterApiUrl}/api/v1/tokens/revoke`,
            authorization,
            tokenId: row.token_id,
            accountIndex,
            fetchImpl: this.fetchImpl,
          })
        } catch (err) {
          console.warn(
            `[lighter] could not revoke stale read-only token ${row.token_id}; continuing.`,
            err
          )
        }
      }
    } catch (err) {
      console.warn(
        '[lighter] could not clean up stale read-only tokens; creating the new one anyway.',
        err
      )
    }
  }
}

/**
 * Default fetcher: posts a multipart/form-data request to Lighter's
 * `tokens/create` endpoint and returns the parsed response. Throws a
 * {@link PerpsError} with the Lighter-side body when the response is
 * non-2xx.
 * @internal
 */
export const defaultLighterTokenFetcher: LighterTokenFetcher = async ({
  url,
  authorization,
  name,
  accountIndex,
  expiry,
  subAccountAccess,
  scopes,
  fetchImpl,
}) => {
  const form = new FormData()
  form.set('name', name)
  form.set('account_index', String(accountIndex))
  form.set('expiry', String(expiry))
  form.set('sub_account_access', String(subAccountAccess))
  form.set('scopes', scopes)

  const response = await (fetchImpl ?? fetch)(url, {
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

/**
 * Default list fetcher: `GET /api/v1/tokens` with `account_index` as a query
 * parameter. Lighter's OpenAPI defines no request body for this route. Throws
 * a {@link PerpsError} with the Lighter-side body when the response is
 * non-2xx.
 * @internal
 */
export const defaultLighterTokenListFetcher: LighterTokenListFetcher = async ({
  url,
  authorization,
  accountIndex,
  fetchImpl,
}) => {
  const query = new URLSearchParams({ account_index: String(accountIndex) })

  const response = await (fetchImpl ?? fetch)(`${url}?${query.toString()}`, {
    headers: { authorization },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new PerpsError(
      PerpsErrorCode.ServerError,
      `Lighter tokens returned ${response.status}: ${body || '<empty>'}`
    )
  }

  return (await response.json()) as LighterListTokensResponse
}

/**
 * Default revoke fetcher: posts `application/x-www-form-urlencoded` to
 * Lighter's `tokens/revoke` endpoint, which is the content type Lighter's
 * OpenAPI declares for that route. Throws a {@link PerpsError} with the
 * Lighter-side body when the response is non-2xx.
 * @internal
 */
export const defaultLighterTokenRevokeFetcher: LighterTokenRevokeFetcher =
  async ({ url, authorization, tokenId, accountIndex, fetchImpl }) => {
    const form = new URLSearchParams({
      token_id: String(tokenId),
      account_index: String(accountIndex),
    })

    const response = await (fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new PerpsError(
        PerpsErrorCode.ServerError,
        `Lighter tokens/revoke returned ${response.status}: ${body || '<empty>'}`
      )
    }

    return (await response.json()) as LighterRevokeTokenResponse
  }
