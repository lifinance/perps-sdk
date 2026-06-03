import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsProviderPlugin } from '../types/core.js'
import { requireProvider } from './requireProvider.js'

const makeClient = (plugins: PerpsProviderPlugin[] = []) =>
  createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: plugins,
  })

describe('requireProvider', () => {
  it('returns the bound provider matching the provider key', () => {
    const plugin = {
      type: 'hyperliquid',
      bind: vi.fn(),
    } as unknown as PerpsProviderPlugin
    const client = makeClient([plugin])

    expect(requireProvider(client, 'hyperliquid')).toBe(
      client.getProvider('hyperliquid')
    )
    expect(requireProvider(client, 'hyperliquid').type).toBe('hyperliquid')
  })

  it('selects the correct provider when several are registered', () => {
    const hl = {
      type: 'hyperliquid',
      bind: vi.fn(),
    } as unknown as PerpsProviderPlugin
    const lighter = {
      type: 'lighter',
      bind: vi.fn(),
    } as unknown as PerpsProviderPlugin
    const client = makeClient([hl, lighter])

    expect(requireProvider(client, 'lighter').type).toBe('lighter')
  })

  it('throws a PerpsError with SDKError code when the plugin is missing', () => {
    const client = makeClient()

    let thrown: unknown
    try {
      requireProvider(client, 'hyperliquid')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(PerpsError)
    const error = thrown as PerpsError
    expect(error.code).toBe(PerpsErrorCode.SDKError)
    expect(error.tool).toBe('@lifi/perps-sdk')
    expect(error.message).toContain(
      "Provider plugin not registered: 'hyperliquid'"
    )
    expect(error.message).toContain('createPerpsClient({ providers: [...] })')
  })

  it('delegates lookup to client.getProvider', () => {
    const plugin = {
      type: 'lighter',
      bind: vi.fn(),
    } as unknown as PerpsProviderPlugin
    const client = makeClient([plugin])
    const spy = vi.spyOn(client, 'getProvider')

    requireProvider(client, 'lighter')

    expect(spy).toHaveBeenCalledWith('lighter')
  })
})
