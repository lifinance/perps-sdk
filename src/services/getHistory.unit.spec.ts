import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockHistory, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getHistory } from './getHistory.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const

describe('getHistory', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return history items', async () => {
    const result = await getHistory(client, {
      dex: 'hyperliquid',
      address: ADDRESS,
    })

    expect(result).toEqual(mockHistory)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].symbol).toBe('BTC')
  })

  it('should include pagination info', async () => {
    const result = await getHistory(client, {
      dex: 'hyperliquid',
      address: ADDRESS,
    })

    expect(result.pagination).toBeDefined()
    expect(result.pagination.hasMore).toBe(false)
    expect(result.pagination.limit).toBe(50)
  })

  it('should pass startTime and endTime as query params', async () => {
    let capturedUrl: URL | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/history`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(mockHistory)
      })
    )

    await getHistory(client, {
      dex: 'hyperliquid',
      address: ADDRESS,
      startTime: 1700000000000,
      endTime: 1700100000000,
    })

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl!.searchParams.get('startTime')).toBe('1700000000000')
    expect(capturedUrl!.searchParams.get('endTime')).toBe('1700100000000')
  })

  it('should not include startTime/endTime when omitted', async () => {
    let capturedUrl: URL | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/history`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(mockHistory)
      })
    )

    await getHistory(client, {
      dex: 'hyperliquid',
      address: ADDRESS,
    })

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl!.searchParams.has('startTime')).toBe(false)
    expect(capturedUrl!.searchParams.has('endTime')).toBe(false)
  })

  it('should pass limit and cursor as query params', async () => {
    let capturedUrl: URL | undefined

    server.use(
      http.get(`${DEFAULT_API_URL}/history`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json(mockHistory)
      })
    )

    await getHistory(client, {
      dex: 'hyperliquid',
      address: ADDRESS,
      limit: 10,
      cursor: 'abc123',
    })

    expect(capturedUrl).toBeDefined()
    expect(capturedUrl!.searchParams.get('limit')).toBe('10')
    expect(capturedUrl!.searchParams.get('cursor')).toBe('abc123')
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getHistory(
        client,
        { dex: 'hyperliquid', address: ADDRESS },
        { signal: controller.signal }
      )
    ).rejects.toThrow()
  })
})
