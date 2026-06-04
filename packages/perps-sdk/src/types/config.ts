import type { Account, WalletClient } from 'viem'
import type { RetryConfig } from '../transport/retryPolicy.js'

/**
 * Viem `WalletClient` shape used by `PerpsSDKClient.userWallet`. Aliased here
 * so provider plugins can name the type without re-deriving the viem generics.
 *
 * @public
 */
export type PerpsClientSigner = WalletClient<any, any, Account>

/**
 * Per-provider config — restricts which `markets` the WS client subscribes
 * to. Indexed by provider key.
 *
 * @public
 */
export interface ProviderConfig {
  markets?: string[]
}

/**
 * @deprecated Use {@link ProviderConfig}.
 * @public
 */
export type HyperliquidConfig = ProviderConfig

/**
 * Map of per-provider {@link ProviderConfig}, keyed by provider key.
 *
 * @public
 */
export interface ProviderConfigs {
  [provider: string]: ProviderConfig | undefined
}

/**
 * Hook to rewrite each outgoing request's URL/`RequestInit` before it is sent.
 *
 * @public
 */
export type RequestInterceptor = (
  url: string,
  options: RequestInit
) => RequestInit | Promise<RequestInit>

/**
 * Per-call request options threaded through the service functions.
 *
 * @public
 */
export interface SDKRequestOptions {
  signal?: AbortSignal
  /**
   * Lighter auth token for authenticated read endpoints (getOrders, getOrder,
   * getActivity). Create via `lighterSigner.createAuthToken(deadline, context)`.
   * Forwarded as `Authorization: Bearer <token>` and never persisted by the
   * backend — read-only by design (8h max TTL, cannot authorize writes).
   */
  lighterAuthToken?: string
}

/**
 * Immutable snapshot of the resolved client configuration after defaults
 * are applied. Exposed via {@link PerpsSDKClient.config}.
 *
 * @public
 */
export interface PerpsBaseConfig {
  integrator: string
  apiKey: string
  apiUrl: string
  disableVersionCheck?: boolean
  requestInterceptor?: RequestInterceptor
  providers?: ProviderConfigs
  retry?: RetryConfig
  fetch?: typeof fetch
}
