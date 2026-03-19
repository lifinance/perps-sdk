import { PerpsErrorCode } from '@lifi/perps-types'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../agent/storage.js'
import { PerpsClient } from './PerpsClient.js'
import { SigningMode } from './types.js'

describe('PerpsClient', () => {
  let client: PerpsClient
  const userAddress = '0x1234567890123456789012345678901234567890'
  const dex = 'hyperliquid'

  beforeEach(() => {
    client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      storage: createMemoryStorage(),
    })
  })

  describe('signing mode', () => {
    it('should default to USER mode', () => {
      expect(client.getSigningMode(userAddress, dex)).toBe(SigningMode.USER)
    })

    it('should set USER_AGENT mode and create agent', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      expect(client.getSigningMode(userAddress, dex)).toBe(
        SigningMode.USER_AGENT
      )
      expect(await client.hasAgent(userAddress, dex)).toBe(true)
    })

    it('should get agent address in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      const agentAddress = await client.getAgentAddress(userAddress, dex)
      expect(agentAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should throw when getting agent in USER mode', async () => {
      await expect(client.getAgentAddress(userAddress, dex)).rejects.toThrow()
    })
  })

  describe('client property', () => {
    it('should expose underlying SDK client', () => {
      expect(client.client).toBeDefined()
      expect(client.client.config.integrator).toBe('test-app')
    })
  })

  describe('removeAgent', () => {
    it('should remove agent and reset signing mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)
      expect(client.getSigningMode(userAddress, dex)).toBe(
        SigningMode.USER_AGENT
      )

      await client.removeAgent(userAddress, dex)

      expect(client.getSigningMode(userAddress, dex)).toBe(SigningMode.USER)
      expect(await client.hasAgent(userAddress, dex)).toBe(false)
    })
  })

  describe('placeOrder', () => {
    it('should throw in USER mode', async () => {
      try {
        await client.placeOrder({
          address: userAddress,
          dex,
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        })
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.code).toBe(PerpsErrorCode.SDKError)
        expect(error.message).toContain('USER_AGENT mode')
      }
    })

    it('should place order in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      const result = await client.placeOrder({
        address: userAddress,
        dex,
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'MARKET' as any,
        size: '0.1',
        price: '95000.00',
      })

      expect(result.results).toHaveLength(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].orderId).toBe('neworder123')
    })
  })

  describe('cancelOrders', () => {
    it('should throw in USER mode', async () => {
      try {
        await client.cancelOrders({
          address: userAddress,
          dex,
          ids: ['order1'],
        })
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.code).toBe(PerpsErrorCode.SDKError)
      }
    })

    it('should cancel orders in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      const result = await client.cancelOrders({
        address: userAddress,
        dex,
        ids: ['order1'],
      })

      expect(result.results).toBeDefined()
    })
  })

  describe('buildAuthorization', () => {
    it('should auto-inject signerAddress in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      const result = await client.buildAuthorization({
        dex,
        address: userAddress,
        authorizations: [
          { key: 'ApproveAgent', params: { agentAddress: '0xagent' } },
        ],
      })

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].action).toBe('ApproveAgent')
    })

    it('should use address as signerAddress in USER mode', async () => {
      // USER mode is default, no need to set explicitly
      const result = await client.buildAuthorization({
        dex,
        address: userAddress,
        authorizations: [{ key: 'ApproveBuilderFee' }],
      })

      expect(result.actions).toHaveLength(1)
    })
  })

  describe('buildOrder', () => {
    it('should work in USER mode', async () => {
      const result = await client.buildOrder({
        address: userAddress,
        dex,
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'LIMIT' as any,
        size: '0.1',
        price: '94000.00',
      })

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].action).toBe('placeOrder')
    })

    it('should work in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, dex, SigningMode.USER_AGENT)

      const result = await client.buildOrder({
        address: userAddress,
        dex,
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'LIMIT' as any,
        size: '0.1',
        price: '94000.00',
      })

      expect(result.actions).toHaveLength(1)
    })
  })

  describe('buildCancelOrder', () => {
    it('should work in USER mode', async () => {
      const result = await client.buildCancelOrder({
        address: userAddress,
        dex,
        ids: ['order1'],
      })

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].action).toBe('cancelOrder')
    })
  })
})
