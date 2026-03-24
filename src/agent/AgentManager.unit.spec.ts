import { isAddress } from 'viem'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentManager } from './AgentManager.js'
import { createMemoryStorage } from './storage.js'

describe('AgentManager', () => {
  let manager: AgentManager

  beforeEach(() => {
    manager = new AgentManager(createMemoryStorage())
  })

  afterEach(() => {
    manager.clearCache()
  })

  const userAddress = '0x1234567890123456789012345678901234567890'
  const provider = 'hyperliquid'

  it('should create a new agent', async () => {
    const agent = await manager.getOrCreateAgent(userAddress, provider)

    expect(agent).toBeDefined()
    expect(isAddress(agent.address)).toBe(true)
    expect(agent.privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/)
  })

  it('should return existing agent on subsequent calls', async () => {
    const agent1 = await manager.getOrCreateAgent(userAddress, provider)
    const agent2 = await manager.getOrCreateAgent(userAddress, provider)

    expect(agent1.address).toBe(agent2.address)
    expect(agent1.privateKey).toBe(agent2.privateKey)
  })

  it('should throw when getting non-existent agent', async () => {
    await expect(manager.getAgent(userAddress, provider)).rejects.toThrow(
      'Agent not found'
    )
  })

  it('should check if agent exists', async () => {
    expect(await manager.hasAgent(userAddress, provider)).toBe(false)

    await manager.getOrCreateAgent(userAddress, provider)

    expect(await manager.hasAgent(userAddress, provider)).toBe(true)
  })

  it('should remove agent', async () => {
    await manager.getOrCreateAgent(userAddress, provider)
    expect(await manager.hasAgent(userAddress, provider)).toBe(true)

    await manager.removeAgent(userAddress, provider)
    expect(await manager.hasAgent(userAddress, provider)).toBe(false)
  })

  it('should create separate agents for different dexes', async () => {
    const agent1 = await manager.getOrCreateAgent(userAddress, 'dex1')
    const agent2 = await manager.getOrCreateAgent(userAddress, 'dex2')

    expect(agent1.address).not.toBe(agent2.address)
  })

  it('should create separate agents for different users', async () => {
    const user2 = '0x0987654321098765432109876543210987654321'

    const agent1 = await manager.getOrCreateAgent(userAddress, provider)
    const agent2 = await manager.getOrCreateAgent(user2, dex)

    expect(agent1.address).not.toBe(agent2.address)
  })

  it('should import an existing agent', async () => {
    const privateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

    const agent = await manager.importAgent(userAddress, provider, privateKey)

    expect(agent.privateKey).toBe(privateKey)
    // Known address for this private key (first Hardhat account)
    expect(agent.address.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
    )
  })
})
