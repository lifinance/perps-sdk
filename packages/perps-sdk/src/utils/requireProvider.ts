import { PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsProvider, PerpsSDKClient } from '../types/core.js'

/**
 * Resolve the registered provider plugin for `provider`, or throw. Account
 * reads run direct-to-venue through the plugin, so a missing plugin is a wiring
 * error (the consumer must pass it to `createPerpsClient({ providers: [...] })`)
 * rather than a runtime-recoverable state.
 */
export function requireProvider(
  client: PerpsSDKClient,
  provider: string
): PerpsProvider {
  const plugin = client.getProvider(provider)
  if (plugin === undefined) {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      `Provider plugin not registered: '${provider}'. Pass it to ` +
        'createPerpsClient({ providers: [...] }).'
    )
    error.tool = '@lifi/perps-sdk'
    throw error
  }
  return plugin
}
