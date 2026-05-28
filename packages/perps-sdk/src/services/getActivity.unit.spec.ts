import type { ActivitiesResponse } from '@lifi/perps-types'
import { describe, expect, it, vi } from 'vitest'
import { mockActivity } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import type { PerpsProvider } from '../types/core.js'
import { getActivity } from './getActivity.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

const makeClient = () => {
  const getActivitySpy = vi.fn(
    async (): Promise<ActivitiesResponse> => mockActivity
  )
  const plugin = {
    type: 'hyperliquid',
    getActivity: getActivitySpy,
  } as unknown as PerpsProvider
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    providers: [plugin],
  })
  return { client, getActivitySpy }
}

describe('getActivity', () => {
  it('delegates to the venue plugin with the mapped params and returns its result', async () => {
    const { client, getActivitySpy } = makeClient()

    const result = await getActivity(client, {
      provider: 'hyperliquid',
      address: ADDRESS,
      limit: 10,
      cursor: '1700000000000',
      startTime: 1700000000000,
      endTime: 1700100000000,
    })

    expect(result).toEqual(mockActivity)
    expect(getActivitySpy).toHaveBeenCalledWith(
      client,
      {
        address: ADDRESS,
        limit: 10,
        cursor: '1700000000000',
        startTime: 1700000000000,
        endTime: 1700100000000,
        type: undefined,
      },
      undefined
    )
  })

  it('forwards request options (signal) to the plugin', async () => {
    const { client, getActivitySpy } = makeClient()
    const controller = new AbortController()

    await getActivity(
      client,
      { provider: 'hyperliquid', address: ADDRESS },
      { signal: controller.signal }
    )

    expect(getActivitySpy).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ address: ADDRESS }),
      { signal: controller.signal }
    )
  })

  it('throws when no provider plugin is registered', async () => {
    const client = createPerpsClient({
      integrator: 'test-app',
      apiKey: 'test-key',
    })
    await expect(
      getActivity(client, { provider: 'hyperliquid', address: ADDRESS })
    ).rejects.toThrow(/Provider plugin not registered: 'hyperliquid'/)
  })
})
