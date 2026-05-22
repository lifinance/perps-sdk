import {
  localStorageAdapter,
  PerpsError,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import type {
  Address,
  ApproveReadOnlyTokenParams,
  LighterAccountConfig,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Account, WalletClient } from 'viem'

const STORAGE_PREFIX = 'lifi:perps:lighter:rotoken'

/**
 * Default Lighter HTTP host the SDK posts the mint request to. Callers
 * pointing at testnet pass an override via {@link LighterReadOnlyTokenManagerOptions.lighterApiUrl}.
 */
export const DEFAULT_LIGHTER_API_URL = 'https://mainnet.zklighter.elliot.ai'

/**
 * Default token name persisted alongside Lighter's `tokens/create` row.
 * Lighter requires a non-empty `name` form field; the literal here is what
 * surfaces in Lighter's UI listing under `app.lighter.xyz/read-only-tokens`.
 */
export const DEFAULT_READ_ONLY_TOKEN_NAME = 'LI.FI Perps'

/**
 * Persisted shape of a Lighter read-only token. The `token` string is
 * Lighter's opaque `ro:{accountIndex}:{scope}:{expiry}:{rand}` bearer; the
 * SDK never parses it — `expiry`/`scope`/`accountIndex` are mint-time inputs
 * we keep alongside so consumers can render expiry UX without re-fetching.
 */
export interface LighterReadOnlyToken {
  /** Opaque bearer string — never parse client-side. */
  token: string
  /** Unix seconds. The SDK's source of truth for expiry. */
  expiry: number
  /** Lighter's `single | all` scope literal recorded at mint time. */
  scope: 'single' | 'all'
  /** Lighter L2 account index the token authorises. */
  accountIndex: number
}

/**
 * Lighter `POST /api/v1/tokens/create` response shape (subset). Lighter's
 * OpenAPI documents additional fields (`token_id`, `name`, `revoked`, etc.)
 * we don't need client-side.
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
 * mint code free of fetch/multipart plumbing and lets tests drop a fixture
 * in without spinning a mock server.
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

/**
 * Function injected for the L1 wallet signature. Signature MUST be EIP-191
 * `personal_sign`. Returning a 0x-prefixed hex string keeps the mint path
 * agnostic to whichever wallet abstraction the consumer wires up.
 */
export type LighterWalletSigner = (params: {
  address: Address
  message: string
}) => Promise<string>

export interface LighterReadOnlyTokenManagerOptions {
  storage?: StorageAdapter
  /** Lighter API host. Defaults to {@link DEFAULT_LIGHTER_API_URL}. */
  lighterApiUrl?: string
  /** Override the multipart POST. Defaults to a `fetch`-based implementation. */
  fetcher?: LighterTokenFetcher
  /** Clock injection for testing expiry logic. Defaults to `Date.now`. */
  now?: () => number
}

export interface ApproveReadOnlyTokenInputs extends ApproveReadOnlyTokenParams {
  /** L1 wallet address that signs the mint message. */
  address: Address
}

export interface ApproveReadOnlyTokenResult {
  token: LighterReadOnlyToken
  /** Projection of the post-mint Lighter account state. */
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

/**
 * Manage the per-account Lighter read-only token alongside the existing
 * `(L1 address, account index)`-scoped storage adapter pattern. Mirrors
 * `AgentManager`'s injection surface so the same `StorageAdapter` powers
 * both. The token is opaque — never parsed client-side; `expiry`/`scope`
 * recorded at mint time are the source of truth.
 *
 * The L1 wallet signer and the HTTP fetcher are both injectable so unit
 * tests don't need a real wallet or network.
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
    const raw = await this.storage.get(key)
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as LighterReadOnlyToken
    if (this.isExpired(parsed)) {
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
    const raw =
      this.cache.get(key) ??
      (await (async () => {
        const stored = await this.storage.get(key)
        return stored ? (JSON.parse(stored) as LighterReadOnlyToken) : undefined
      })())
    if (!raw) {
      return false
    }
    const remainingSeconds = raw.expiry - Math.floor(this.now() / 1000)
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
   * Mint and persist a new Lighter read-only token.
   *
   * Asks `signer` to produce an EIP-191 `personal_sign` over the
   * `createToken`-specific L1 message, POSTs the signed payload to Lighter's
   * `/api/v1/tokens/create` via the injected `fetcher`, and persists the
   * returned bearer alongside its `expiry`/`scope`/`accountIndex`.
   *
   * `expirySeconds` is the absolute unix-seconds expiry Lighter records on
   * the row. Lighter enforces 1 day ≤ lifetime ≤ 10 years server-side; the
   * SDK does NOT pre-validate and surfaces Lighter's 400 verbatim.
   *
   * `scope` defaults to `'all'` (token authorises read access to every
   * account owned by the L1 signer). `'single'` is wired through so callers
   * who need per-account scoping can opt in.
   *
   * @param signer EIP-191 wallet signer for the L1 message.
   * @param inputs Token-mint parameters plus the L1 `address` that signs.
   */
  async approve(
    signer: LighterWalletSigner,
    inputs: ApproveReadOnlyTokenInputs
  ): Promise<ApproveReadOnlyTokenResult> {
    const { address, accountIndex, expirySeconds, scope } = inputs
    const message = buildReadOnlyTokenMessage({
      accountIndex,
      expirySeconds,
      scope,
    })
    const authorization = await signer({ address, message })

    const response = await this.fetcher({
      url: `${this.lighterApiUrl}/api/v1/tokens/create`,
      authorization,
      name: DEFAULT_READ_ONLY_TOKEN_NAME,
      accountIndex,
      expiry: expirySeconds,
      subAccountAccess: scope === 'all',
      scopes: scope,
    })

    const token: LighterReadOnlyToken = {
      token: response.api_token,
      expiry: response.expiry,
      // Lighter echoes the literal we sent; we trust ours over the wire
      // string so we never desynchronise the persisted shape from
      // the typed `'single' | 'all'` discriminator.
      scope,
      accountIndex: response.account_index,
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
 * Build the EIP-191 message the user's L1 wallet signs to authorise a
 * Lighter `tokens/create` request.
 *
 * NOTE — Lighter's public docs do not fully specify the message template
 * for the read-only token mint flow. The shape here is the SDK's best-fit
 * given (a) Lighter's UI hosts the equivalent flow at
 * `app.lighter.xyz/read-only-tokens` and (b) Lighter's `tokens/create`
 * endpoint reads `account_index`, `expiry`, and `scopes` as form fields.
 * If Lighter publishes a documented template that diverges, update this
 * builder — the test fixtures will fail loudly.
 */
export function buildReadOnlyTokenMessage(params: {
  accountIndex: number
  expirySeconds: number
  scope: 'single' | 'all'
}): string {
  return [
    'Lighter Read-Only Token',
    `account_index=${params.accountIndex}`,
    `expiry=${params.expirySeconds}`,
    `scopes=${params.scope}`,
  ].join('\n')
}

/**
 * Default fetcher: posts a multipart/form-data request to Lighter's
 * `tokens/create` endpoint and returns the parsed response. Throws a
 * {@link PerpsError} with the Lighter-side body when the response is
 * non-2xx.
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

/**
 * Adapter producing a {@link LighterWalletSigner} from a viem
 * `WalletClient`. Pulled out so `PerpsClient.approveReadOnlyToken` can call
 * into the manager without leaking viem types past the manager's boundary.
 */
export function walletClientSigner(
  client: WalletClient<any, any, Account>
): LighterWalletSigner {
  return ({ message }) =>
    client.signMessage({ account: client.account, message })
}
