import { PerpsSDKError } from '../errors/PerpsSDKError.js'
import { hyperliquidAuthProvider } from './hyperliquid.js'
import type { DexAuthProvider } from './types.js'

const providers: Record<string, DexAuthProvider> = {
  hyperliquid: hyperliquidAuthProvider,
}

export function getDexAuthProvider(dex: string): DexAuthProvider {
  const provider = providers[dex]
  if (!provider) {
    throw new PerpsSDKError(new Error(`Unsupported dex: ${dex}`))
  }
  return provider
}
