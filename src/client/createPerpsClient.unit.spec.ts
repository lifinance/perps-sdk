import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/handlers.js'
import { PerpsErrorCode } from '../types/perps.js'
import { createPerpsClient } from './createPerpsClient.js'

describe('createPerpsClient', () => {
  it('should create client with required integrator', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      healthCheck: false,
    })

    expect(client.config.integrator).toBe('test-app')
    expect(client.config.apiUrl).toBe('https://li.quest/v1/perps')
  })

  it('should use custom apiUrl when provided', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiUrl: 'https://custom.api/perps',
      healthCheck: false,
    })

    expect(client.config.apiUrl).toBe('https://custom.api/perps')
  })

  it('should store apiKey when provided', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'secret-key',
      healthCheck: false,
    })

    expect(client.config.apiKey).toBe('secret-key')
  })

  it('should throw when integrator is missing', () => {
    expect(() =>
      createPerpsClient({ integrator: '', healthCheck: false })
    ).toThrow()
  })

  it('should include correct error code when integrator is missing', () => {
    try {
      createPerpsClient({ integrator: '', healthCheck: false })
    } catch (error: any) {
      expect(error.code).toBe(PerpsErrorCode.ValidationError)
    }
  })

  it('should provide access to agentManager', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      healthCheck: false,
    })

    expect(client.agentManager).toBeDefined()
    expect(typeof client.agentManager.getOrCreateAgent).toBe('function')
  })

  it('should support requestInterceptor', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      healthCheck: false,
      requestInterceptor: (_url, options) => {
        return options
      },
    })

    expect(client.config.requestInterceptor).toBeDefined()
    expect(typeof client.config.requestInterceptor).toBe('function')
  })

  it('should create immutable config', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      healthCheck: false,
    })
    const config1 = client.config
    const config2 = client.config

    expect(config1).toBe(config2)
  })

  describe('health check', () => {
    it('should expose a ready promise', () => {
      const client = createPerpsClient({ integrator: 'test-app' })

      expect(client.ready).toBeInstanceOf(Promise)
    })

    it('should resolve ready when health endpoint is available', async () => {
      const client = createPerpsClient({ integrator: 'test-app' })

      await expect(client.ready).resolves.toBeUndefined()
    })

    it('should resolve immediately when healthCheck is false', async () => {
      const client = createPerpsClient({
        integrator: 'test-app',
        healthCheck: false,
      })

      await expect(client.ready).resolves.toBeUndefined()
    })

    it('should reject ready when health endpoint never responds', async () => {
      server.use(
        http.get('https://li.quest/health/live', () => HttpResponse.error())
      )

      const client = createPerpsClient({ integrator: 'test-app' })

      await expect(client.ready).rejects.toThrow('API health check failed')
    }, 30_000)
  })
})
