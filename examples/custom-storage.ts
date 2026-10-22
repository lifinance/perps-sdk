import {
  createMemoryStorage,
  PerpsClient,
  type StorageAdapter,
} from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

// Optional on the production API. Get a key at https://portal.li.fi/.
const API_KEY = 'YOUR_API_KEY'

async function run() {
  // Each provider plugin takes its own `storage` for the per-address signing
  // credential (the Hyperliquid agent keypair). The default is encrypted
  // browser localStorage, which stores nothing outside a browser.

  // In-memory storage: for tests and servers. A restart loses the credential.
  const memoryPerps = new PerpsClient({
    apiKey: API_KEY,
    providers: [hyperliquidProvider({ storage: createMemoryStorage() })],
  })
  console.log('Memory client created:', memoryPerps.client.config.apiUrl)

  // A custom adapter: replace the Map with a durable, secret store.
  const myStore = new Map<string, string>()
  const storage: StorageAdapter = {
    get: async (key) => myStore.get(key) ?? null,
    set: async (key, value) => {
      myStore.set(key, value)
    },
    remove: async (key) => {
      myStore.delete(key)
    },
  }
  const customPerps = new PerpsClient({
    apiKey: API_KEY,
    providers: [hyperliquidProvider({ storage })],
  })
  console.log('Custom client created:', customPerps.client.config.apiUrl)
}

run()
