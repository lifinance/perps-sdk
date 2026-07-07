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
 * Consumer-supplied hook invoked at the SDK's signing choke point to switch the
 * user's wallet to a USER-signed EIP-712 action's target chain. Modelled on
 * `@lifi/sdk`'s switch-chain contract: a json-rpc wallet switches in place and
 * resolves to the re-fetched client; a local/private-key signer resolves to a
 * chain-bound client (or signs offline). Resolve to `undefined` to signal the
 * switch could not be performed.
 *
 * @public
 */
export type SwitchChainHook = (
  chainId: number
) => Promise<PerpsClientSigner | undefined>

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
   * Lighter auth token consumed by provider-direct venue reads (getOrders,
   * getOrder, getActivity, getAccount). Create via
   * `lighterSigner.createAuthToken(deadline, context)`. Sent only to Lighter
   * venue endpoints, never to the LI.FI backend — read-only by design
   * (8h max TTL, cannot authorize writes).
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
