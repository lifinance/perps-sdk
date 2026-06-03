import type {
  PerpsProvider,
  PerpsProviderPlugin,
  PerpsSDKClient,
} from '../types/core.js'

/**
 * Inject `client` into a {@link PerpsProviderPlugin} once via its
 * {@link PerpsProviderPlugin.bind} hook, returning the runtime
 * {@link PerpsProvider} — the plugin with its one-shot `bind` member dropped so
 * consumers cannot re-bind a live provider. The read methods are already
 * clientless (`getX(params, options?)`); they resolve their runtime deps from
 * the context the plugin captured during `bind`.
 *
 * @internal
 */
export function bindProvider(
  plugin: PerpsProviderPlugin,
  client: PerpsSDKClient
): PerpsProvider {
  plugin.bind(client)
  const { bind: _bind, ...provider } = plugin
  return provider
}
