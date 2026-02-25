import { createMemoryStorage, PerpsClient } from '@lifi/perps-sdk'

async function run() {
  // In-memory storage (for testing or server-side)
  const memoryPerps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
    storage: createMemoryStorage(),
  })
  console.log('Memory client created:', memoryPerps.client.config.integrator)

  // Custom storage adapter
  const myStore = new Map<string, string>()
  const customPerps = new PerpsClient({
    integrator: 'my-app',
    apiKey: 'your-api-key',
    storage: {
      get: async (key) => myStore.get(key) ?? null,
      set: async (key, value) => {
        myStore.set(key, value)
      },
      remove: async (key) => {
        myStore.delete(key)
      },
    },
  })
  console.log('Custom client created:', customPerps.client.config.integrator)
}

run()
