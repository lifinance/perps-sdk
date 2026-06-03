import type {
  PerpsProvider,
  PerpsProviderPlugin,
  PerpsSDKClient,
} from '../types/core.js'

/**
 * Bind a {@link PerpsProviderPlugin} to `client`, returning a runtime
 * {@link PerpsProvider} whose six read methods omit the leading `client`
 * argument (it is closed over here) and call the plugin with `client`
 * re-threaded. Every other member — `type`, the write/setup hooks, and any
 * provider-specific extras (e.g. Lighter's `resolveAuthToken`, Hyperliquid's
 * agent management) — passes through unchanged via spread-then-override.
 *
 * @internal
 */
export function bindProvider(
  plugin: PerpsProviderPlugin,
  client: PerpsSDKClient
): PerpsProvider {
  return {
    ...plugin,
    getAccount: (params, options) => plugin.getAccount(client, params, options),
    getPositions: (params, options) =>
      plugin.getPositions(client, params, options),
    getOrders: (params, options) => plugin.getOrders(client, params, options),
    getOrder: (params, options) => plugin.getOrder(client, params, options),
    getFills: (params, options) => plugin.getFills(client, params, options),
    getActivity: (params, options) =>
      plugin.getActivity(client, params, options),
  }
}
