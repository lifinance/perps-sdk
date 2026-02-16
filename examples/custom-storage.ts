import { createMemoryStorage, PerpsClient } from '@lifi/perps-sdk'

async function run() {
  // In-memory storage (for testing or server-side)
  const memoryPerps = new PerpsClient({
    integrator: 'my-app',
    storage: createMemoryStorage(),
  })
  console.log('Memory client ready:', await memoryPerps.ready)

  // Custom storage adapter
  const myStore = new Map<string, string>()
  const customPerps = new PerpsClient({
    integrator: 'my-app',
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
  console.log('Custom client ready:', await customPerps.ready)
}

run()
