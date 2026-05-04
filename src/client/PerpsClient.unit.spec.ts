import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  mockCreateOrderResponse,
  mockSubmitOrderResponse,
  server,
} from '../../test/handlers.js'
import { createMemoryStorage } from '../agent/storage.js'
import { DEFAULT_API_URL } from './createPerpsClient.js'
import { PerpsClient } from './PerpsClient.js'
import { SigningMode } from './types.js'

describe('PerpsClient', () => {
  let client: PerpsClient
  const userAddress = '0x1234567890123456789012345678901234567890'
  const provider = 'hyperliquid'

  beforeEach(() => {
    client = new PerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      storage: createMemoryStorage(),
    })
  })

  describe('signing mode', () => {
    it('should default to USER_AGENT mode', () => {
      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
    })

    it('should set USER_AGENT mode and create agent', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
      expect(await client.hasAgent(userAddress, provider)).toBe(true)
    })

    it('should get agent address in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const agentAddress = await client.getAgentAddress(userAddress, provider)
      expect(agentAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should throw when getting agent in USER mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      await expect(
        client.getAgentAddress(userAddress, provider)
      ).rejects.toThrow()
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
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)
      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )

      await client.removeAgent(userAddress, provider)

      expect(client.getSigningMode(userAddress, provider)).toBe(
        SigningMode.USER_AGENT
      )
      expect(await client.hasAgent(userAddress, provider)).toBe(false)
    })
  })

  describe('placeOrder', () => {
    it('should throw in USER mode without a signer configured', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      try {
        await client.placeOrder({
          address: userAddress,
          provider,
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        })
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('signer')
      }
    })

    it('should place order in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.placeOrder({
        address: userAddress,
        provider,
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
    it('should throw in USER mode without a signer configured', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      try {
        await client.cancelOrders({
          address: userAddress,
          provider,
          ids: ['order1'],
        })
        expect.fail('Should have thrown')
      } catch (error: any) {
        expect(error.message).toContain('signer')
      }
    })

    it('should cancel orders in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.cancelOrders({
        address: userAddress,
        provider,
        ids: ['order1'],
      })

      expect(result.results).toBeDefined()
    })
  })

  describe('buildPrerequisites', () => {
    it('should auto-inject signerAddress in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.buildPrerequisites({
        provider,
        address: userAddress,
      })

      expect(result.actions).toBeDefined()
    })

    it('should work in USER mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      const result = await client.buildPrerequisites({
        provider,
        address: userAddress,
      })

      expect(result.actions).toBeDefined()
    })
  })

  describe('buildOrder', () => {
    it('should work in USER mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      const result = await client.buildOrder({
        address: userAddress,
        provider,
        symbol: 'BTC',
        side: 'BUY' as any,
        type: 'LIMIT' as any,
        size: '0.1',
        price: '94000.00',
      })

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].action).toBe(ActionType.PLACE_ORDER)
    })

    it('should work in USER_AGENT mode', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      const result = await client.buildOrder({
        address: userAddress,
        provider,
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
      await client.setSigningMode(userAddress, provider, SigningMode.USER)
      const result = await client.buildCancelOrder({
        address: userAddress,
        provider,
        ids: ['order1'],
      })

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0].action).toBe(ActionType.PLACE_ORDER)
    })
  })

  describe('execute InvalidNonce retry', () => {
    const BASE_URL = DEFAULT_API_URL

    it('retries the full create→sign→execute cycle on InvalidNonce and succeeds', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          if (executeCallCount < 3) {
            return HttpResponse.json(
              { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
              { status: 400 }
            )
          }
          return HttpResponse.json(mockSubmitOrderResponse)
        })
      )

      const result = await client.execute({
        provider,
        address: userAddress,
        action: ActionType.PLACE_ORDER,
        params: {
          symbol: 'BTC',
          side: 'BUY' as any,
          type: 'MARKET' as any,
          size: '0.1',
          price: '95000.00',
        },
      })

      expect(executeCallCount).toBe(3)
      expect(result.results[0].success).toBe(true)
    })

    it('throws InvalidNonce after exhausting all retries', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      server.use(
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json(
            { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
            { status: 400 }
          )
        )
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.InvalidNonce })
    })

    it('does not retry on non-InvalidNonce errors', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let executeCallCount = 0
      server.use(
        http.post(`${BASE_URL}/executeAction`, () => {
          executeCallCount++
          return HttpResponse.json(
            { code: PerpsErrorCode.ValidationError, message: 'bad params' },
            { status: 400 }
          )
        })
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })

      expect(executeCallCount).toBe(1)
    })

    it('calls createAction once per retry attempt', async () => {
      await client.setSigningMode(userAddress, provider, SigningMode.USER_AGENT)

      let createCallCount = 0
      server.use(
        http.post(`${BASE_URL}/createAction`, () => {
          createCallCount++
          return HttpResponse.json(mockCreateOrderResponse)
        }),
        http.post(`${BASE_URL}/executeAction`, () =>
          HttpResponse.json(
            { code: PerpsErrorCode.InvalidNonce, message: 'stale nonce' },
            { status: 400 }
          )
        )
      )

      await expect(
        client.execute({
          provider,
          address: userAddress,
          action: ActionType.PLACE_ORDER,
          params: {
            symbol: 'BTC',
            side: 'BUY' as any,
            type: 'MARKET' as any,
            size: '0.1',
            price: '95000.00',
          },
        })
      ).rejects.toMatchObject({ code: PerpsErrorCode.InvalidNonce })

      expect(createCallCount).toBe(3)
    })
  })
})
