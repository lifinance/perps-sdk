import type { PerpsConfig } from '../types/api.js'
import type { PerpsBaseConfig } from '../types/config.js'
import type { PerpsProvider, PerpsSDKClient } from '../types/provider.js'
import { bindProvider } from './bindProvider.js'

/**
 * Default LI.FI perps API base URL used when `PerpsConfig.apiUrl` is omitted.
 *
 * @public
 */
export const DEFAULT_API_URL = 'https://li.quest/v1/perps'

/**
 * Construct the low-level {@link PerpsSDKClient} — config, the optional
 * end-user wallet, and provider registry — shared by the service functions and
 * the higher-level {@link PerpsClient}.
 *
 * @example
 * ```ts
 * const client = createPerpsClient({
 *   apiKey: 'key',
 *   providers: [hyperliquidProvider()],
 * })
 * ```
 * @public
 */
export function createPerpsClient(options: PerpsConfig): PerpsSDKClient {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL

  const config: PerpsBaseConfig = {
    integrator: options.integrator?.trim() || undefined,
    apiKey: options.apiKey?.trim() ?? '',
    apiUrl,
    requestInterceptor: options.requestInterceptor,
    retry: options.retry,
    fetch: options.fetch,
  }

  const client: PerpsSDKClient = {
    get config() {
      return config
    },
    get userWallet() {
      return options.userWallet
    },
    get providers() {
      return boundProviders
    },
    getProvider(key: string): PerpsProvider | undefined {
      return boundProviders.find((p) => p.type === key)
    },
  }

  const boundProviders: PerpsProvider[] = (options.providers ?? []).map(
    (plugin) => bindProvider(plugin, client)
  )

  return client
}
