import { PerpsErrorCode } from '@lifi/perps-types'
import type { Account, WalletClient } from 'viem'
import { PerpsError } from '../errors/PerpsError.js'
import type { RetryConfig } from '../transport/retryPolicy.js'
import type {
  PerpsBaseConfig,
  PerpsProvider,
  PerpsSDKClient,
  ProviderConfigs,
  RequestInterceptor,
} from '../types/core.js'

export type {
  HyperliquidConfig,
  PerpsBaseConfig,
  PerpsProvider,
  PerpsSDKClient,
  ProviderConfig,
  ProviderConfigs,
  RequestInterceptor,
  SDKRequestOptions,
} from '../types/core.js'

/**
 * Default LI.FI perps API base URL used when `PerpsConfig.apiUrl` is omitted.
 *
 * @public
 */
export const DEFAULT_API_URL = 'https://develop.li.quest/v1/perps'

/**
 * Configuration for {@link createPerpsClient}.
 *
 * @public
 */
export interface PerpsConfig {
  integrator: string
  apiKey: string
  apiUrl?: string
  disableVersionCheck?: boolean
  requestInterceptor?: RequestInterceptor
  /**
   * Provider plugins or per-provider config. Two shapes are accepted:
   *
   * - `PerpsProvider[]` — plugin objects implementing the read surface
   *   for one DEX each. Look them up at runtime via
   *   `client.getProvider(key)`. Modelled on `@lifi/sdk`'s
   *   `providers: SDKProvider[]`.
   * - `ProviderConfigs` — keyed config object (e.g.
   *   `{ hyperliquid: { markets: [...] } }`). Used internally by
   *   `PerpsWsClient` to filter which markets are subscribed to.
   *
   * Both may be supplied during the migration to provider packages;
   * the array form is preferred for new code.
   */
  providers?: PerpsProvider[] | ProviderConfigs
  /**
   * Wallet signer used whenever an action's descriptor names the user wallet
   * in its `signers` list. Accepts any viem-compatible WalletClient:
   *   - Browser wallet: wagmi's useWalletClient() result
   *   - Private key:    createWalletClient({ account: privateKeyToAccount('0x...'), transport: http() })
   *   - Mnemonic:       createWalletClient({ account: mnemonicToAccount('word1 ...'), transport: http() })
   */
  signer?: WalletClient<any, any, Account>
  /**
   * Retry behaviour for HTTP requests. Pass `false` to disable retries
   * everywhere (single-shot — useful when wrapping with TanStack Query or
   * similar consumer-side retry). Pass a flat {@link RetryPolicy} to apply
   * one policy across providers, or a per-provider object keyed by provider
   * type (`'lifi'`, `'hyperliquid'`, `'lighter'`) with an optional `default`
   * fallback. Per-provider built-in defaults apply when omitted.
   */
  retry?: RetryConfig
  /**
   * Replace the global `fetch` used by the SDK and provider HTTP clients —
   * for instrumentation, custom proxying, or test injection. Does not affect
   * retry policy.
   */
  fetch?: typeof fetch
}

/**
 * Construct the low-level {@link PerpsSDKClient} — config, signer, agent
 * manager, and provider registry — shared by the service functions and the
 * higher-level {@link PerpsClient}.
 *
 * @throws {PerpsError} When `options.integrator` is missing.
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   integrator: 'my-app',
 *   apiKey: 'key',
 *   providers: [hyperliquidProvider()],
 * })
 * ```
 * @public
 */
export function createPerpsClient(options: PerpsConfig): PerpsSDKClient {
  if (!options.integrator) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      'Integrator is required. Please see documentation at https://docs.li.fi'
    )
    error.tool = '@lifi/perps-sdk'
    throw error
  }

  const apiUrl = options.apiUrl ?? DEFAULT_API_URL
  const { providerPlugins, providerConfigs } = splitProviders(options.providers)

  const config: PerpsBaseConfig = {
    integrator: options.integrator,
    apiKey: options.apiKey,
    apiUrl,
    disableVersionCheck: options.disableVersionCheck,
    requestInterceptor: options.requestInterceptor,
    providers: providerConfigs,
    retry: options.retry,
    fetch: options.fetch,
  }

  return {
    get config() {
      return config
    },
    get signer() {
      return options.signer
    },
    get providers() {
      return providerPlugins
    },
    getProvider(key: string): PerpsProvider | undefined {
      return providerPlugins.find((p) => p.type === key)
    },
  }
}

/**
 * Split the overloaded `providers` option into its two shapes — the
 * plugin array used by {@link PerpsSDKClient.getProvider}, and the
 * keyed `ProviderConfigs` consumed internally by `PerpsWsClient` for
 * markets filtering.
 */
function splitProviders(input: PerpsProvider[] | ProviderConfigs | undefined): {
  providerPlugins: PerpsProvider[]
  providerConfigs?: ProviderConfigs
} {
  if (input === undefined) {
    return { providerPlugins: [] }
  }
  if (Array.isArray(input)) {
    return { providerPlugins: input }
  }
  return { providerPlugins: [], providerConfigs: input }
}
