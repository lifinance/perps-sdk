import { createMemoryStorage } from '@lifi/perps-sdk'
import { isAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HyperliquidAgentStore } from './HyperliquidAgentStore.js'

describe('HyperliquidAgentStore', () => {
  let store: HyperliquidAgentStore

  beforeEach(() => {
    store = new HyperliquidAgentStore(createMemoryStorage())
  })

  afterEach(() => {
    store.clearCache()
  })

  const userAddress = '0x1234567890123456789012345678901234567890'

  it('creates a new agent', async () => {
    const agent = await store.getOrCreate(userAddress)

    expect(agent).toBeDefined()
    expect(isAddress(agent.address)).toBe(true)
    expect(agent.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/)
  })

  it('returns the existing agent on subsequent calls', async () => {
    const agent1 = await store.getOrCreate(userAddress)
    const agent2 = await store.getOrCreate(userAddress)

    expect(agent1.address).toBe(agent2.address)
    expect(agent1.privateKey).toBe(agent2.privateKey)
  })

  it('throws when getting a non-existent agent', async () => {
    await expect(store.get(userAddress)).rejects.toThrow('Agent not found')
  })

  it('reports agent existence', async () => {
    expect(await store.has(userAddress)).toBe(false)

    await store.getOrCreate(userAddress)

    expect(await store.has(userAddress)).toBe(true)
  })

  it('removes an agent', async () => {
    await store.getOrCreate(userAddress)
    expect(await store.has(userAddress)).toBe(true)

    await store.remove(userAddress)
    expect(await store.has(userAddress)).toBe(false)
  })

  it('creates separate agents for different users', async () => {
    const user2 = '0x0987654321098765432109876543210987654321'

    const agent1 = await store.getOrCreate(userAddress)
    const agent2 = await store.getOrCreate(user2)

    expect(agent1.address).not.toBe(agent2.address)
  })

  it('imports an existing agent keypair', async () => {
    const privateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

    const agent = await store.import(userAddress, privateKey)

    expect(agent.privateKey).toBe(privateKey)
    // Known address for this private key (first Hardhat account).
    expect(agent.address.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
    )
  })

  it('persists agents to the injected storage adapter', async () => {
    const storage = createMemoryStorage()
    const first = new HyperliquidAgentStore(storage)
    const created = await first.getOrCreate(userAddress)

    // A fresh store backed by the same storage reads the persisted agent.
    const second = new HyperliquidAgentStore(storage)
    const reloaded = await second.get(userAddress)
    expect(reloaded.address).toBe(created.address)
    expect(reloaded.privateKey).toBe(created.privateKey)
  })
})
