import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsConfig } from '../types/api.js'
import type { PerpsBaseConfig, ProviderConfigs } from '../types/config.js'
import type {
  PerpsProvider,
  PerpsProviderPlugin,
  PerpsSDKClient,
} from '../types/provider.js'
import { bindProvider } from '../utils/bindProvider.js'

/**
 * Default LI.FI perps API base URL used when `PerpsConfig.apiUrl` is omitted.
 *
 * @public
 */
export const DEFAULT_API_URL = 'https://develop.li.quest/v1/perps'

/**
 * Construct the low-level {@link PerpsSDKClient} — config, the optional
 * end-user wallet, and provider registry — shared by the service functions and
 * the higher-level {@link PerpsClient}.
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

  const boundProviders: PerpsProvider[] = providerPlugins.map((plugin) =>
    bindProvider(plugin, client)
  )

  return client
}

/**
 * Split the overloaded `providers` option into its two shapes — the
 * plugin array used by {@link PerpsSDKClient.getProvider}, and the
 * keyed `ProviderConfigs` consumed internally by `PerpsWsClient` for
 * markets filtering.
 */
export function splitProviders(
  input: PerpsProviderPlugin[] | ProviderConfigs | undefined
): {
  providerPlugins: PerpsProviderPlugin[]
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
