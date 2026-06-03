import type { AccountResponse } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockAccount } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProviderPlugin } from '../types/core.js'
import { getAccount } from './getAccount.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getAccountSpy = vi.fn(async (): Promise<AccountResponse> => mockAccount)
  const plugin = {
    type: 'hyperliquid',
    bind: vi.fn(),
    getAccount: getAccountSpy,
  } as unknown as PerpsProviderPlugin
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getAccountSpy }
}

describe('getAccount', () => {
  it('delegates to the venue plugin with the address and returns its result', async () => {
    const { client, getAccountSpy } = makeClient()

    const result = await getAccount(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
    })

    expect(result).toEqual(mockAccount)
    expect(getAccountSpy).toHaveBeenCalledWith({ address: ADDRESS }, undefined)
  })

  it('forwards request options (signal) to the plugin', async () => {
    const { client, getAccountSpy } = makeClient()
    const controller = new AbortController()

    await getAccount(
      client,
      { provider: 'hyperliquid', address: ADDRESS },
      { signal: controller.signal }
    )

    expect(getAccountSpy).toHaveBeenCalledWith(
      { address: ADDRESS },
      {
        signal: controller.signal,
      }
    )
  })

  it('throws when no provider plugin is registered', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })

    await expect(
      getAccount(client, { provider: 'hyperliquid', address: ADDRESS })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
