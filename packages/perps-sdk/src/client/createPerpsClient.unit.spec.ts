import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { createPerpsClient, DEFAULT_API_URL } from './createPerpsClient.js'

describe('createPerpsClient', () => {
  it('should create client with required integrator', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    expect(client.config.integrator).toBe('test-app')
    expect(client.config.apiUrl).toBe(DEFAULT_API_URL)
  })

  it('should use custom apiUrl when provided', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
      apiUrl: 'https://custom.api/perps',
    })

    expect(client.config.apiUrl).toBe('https://custom.api/perps')
  })

  it('should store apiKey when provided', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'secret-key',
    })

    expect(client.config.apiKey).toBe('secret-key')
  })

  it('should throw when integrator is missing', () => {
    expect(() =>
      createPerpsClient({ integrator: '', apiKey: 'test-key' })
    ).toThrow()
  })

  it('should include correct error code when integrator is missing', () => {
    try {
      createPerpsClient({ integrator: '', apiKey: 'test-key' })
    } catch (error: any) {
      expect(error.code).toBe(PerpsErrorCode.SDKError)
    }
  })

  it('should support requestInterceptor', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
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
      apiKey: 'test-key',
    })
    const config1 = client.config
    const config2 = client.config

    expect(config1).toBe(config2)
  })

  it('should expose an empty providers list when none are supplied', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    expect(client.providers).toEqual([])
    expect(client.getProvider('hyperliquid')).toBeUndefined()
  })
})
