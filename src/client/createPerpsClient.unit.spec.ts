import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { createPerpsClient } from './createPerpsClient.js'

describe('createPerpsClient', () => {
  it('should create client with required integrator', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
    })

    expect(client.config.integrator).toBe('test-app')
    expect(client.config.apiUrl).toBe('https://li.quest/v1/perps')
  })

  it('should use custom apiUrl when provided', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
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
    expect(() => createPerpsClient({ integrator: '' })).toThrow()
  })

  it('should include correct error code when integrator is missing', () => {
    try {
      createPerpsClient({ integrator: '' })
    } catch (error: any) {
      expect(error.code).toBe(PerpsErrorCode.ValidationError)
    }
  })

  it('should provide access to agentManager', () => {
    const client = createPerpsClient({
      integrator: 'test-app',
    })

    expect(client.agentManager).toBeDefined()
    expect(typeof client.agentManager.getOrCreateAgent).toBe('function')
  })

  it('should support requestInterceptor', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
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
    })
    const config1 = client.config
    const config2 = client.config

    expect(config1).toBe(config2)
  })
})
