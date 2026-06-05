import { createMemoryStorage, PerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

async function run() {
  // Storage persists the provider's per-address signing credential (the
  // Hyperliquid agent keypair) and is passed to the provider plugin, not the
  // client. Defaults to browser localStorage.

  // In-memory storage (for testing or server-side)
  const memoryPerps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
    providers: [hyperliquidProvider({ storage: createMemoryStorage() })],
  })
  console.log('Memory client created:', memoryPerps.client.config.integrator)

  // Custom storage adapter
  const myStore = new Map<string, string>()
  const customPerps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
    providers: [
      hyperliquidProvider({
        storage: {
          get: async (key) => myStore.get(key) ?? null,
          set: async (key, value) => {
            myStore.set(key, value)
          },
          remove: async (key) => {
            myStore.delete(key)
          },
        },
      }),
    ],
  })
  console.log('Custom client created:', customPerps.client.config.integrator)
}

run()
