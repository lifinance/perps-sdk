import { PerpsError, type PerpsSDKClient } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'

/**
 * Runtime context the Hyperliquid read services resolve their deps from: the
 * bound {@link PerpsSDKClient} (config / fetch / retry / market lookups) and
 * the resolved REST base URL. Captured once in the provider factory's closure
 * via {@link HyperliquidContextRef.bind}; the read methods read it at call
 * time. This is the late-bind the SDK's `bindProvider` sets up — the factory
 * is constructed before the client exists.
 */
export interface HyperliquidContext {
  client: PerpsSDKClient
  apiUrl: string
}

/**
 * Mutable, single-assignment holder for the {@link HyperliquidContext}. The
 * provider factory creates one per instance and exposes `bind`; the read
 * services call {@link HyperliquidContextRef.require} at call time.
 */
export class HyperliquidContextRef {
  private context: HyperliquidContext | undefined

  constructor(private readonly apiUrl: string) {}

  bind(client: PerpsSDKClient): void {
    this.context = { client, apiUrl: this.apiUrl }
  }

  require(): HyperliquidContext {
    if (this.context === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'hyperliquidProvider used before binding. Register it via ' +
          'createPerpsClient({ providers: [hyperliquidProvider()] }).'
      )
    }
    return this.context
  }
}
