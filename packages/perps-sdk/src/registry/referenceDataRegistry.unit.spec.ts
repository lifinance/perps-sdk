import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { http, passthrough } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server as mockServer } from '../../test/handlers.js'
import { createPerpsClient } from '../client/createPerpsClient.js'
import { getAssetRegistry } from './assetRegistry.js'
import { getMarketRegistry } from './marketRegistry.js'

describe('reference registry HTTP freshness in Node', () => {
  let baseUrl: string
  let requests: number
  let headers: Record<string, string>
  let status: number
  let respond: (request: IncomingMessage, response: ServerResponse) => void
  const server = createServer((request, response) => respond(request, response))

  beforeEach(async () => {
    requests = 0
    status = 200
    headers = { 'Cache-Control': 'max-age=60' }
    respond = (request, response) => {
      requests++
      const url = new URL(request.url!, baseUrl)
      const providerId = url.searchParams.get('provider')!
      const id = `${url.pathname}:${providerId}:${request.headers['x-identity'] ?? request.headers['x-lifi-api-key'] ?? 'anonymous'}:${requests}`
      response.writeHead(status, {
        'Content-Type': 'application/json',
        ...headers,
      })
      response.end(
        JSON.stringify({
          assets: [{ providerId, id, displaySymbol: id, logoURI: '' }],
          markets: [{ providerId, id }],
        })
      )
    }
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    mockServer.use(http.all(`${baseUrl}/*`, () => passthrough()))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })

  const client = (apiUrl = baseUrl, apiKey = '') =>
    createPerpsClient({ apiUrl, apiKey, retry: false })

  it.each([
    'assets',
    'markets',
  ] as const)('reuses a fresh %s snapshot and its indexed objects', async (kind) => {
    const sdk = client()
    const registry =
      kind === 'assets'
        ? getAssetRegistry(sdk, 'lighter')
        : getMarketRegistry(sdk, 'lighter')
    const first = await registry.sync()
    const second = await registry.sync()
    expect(second).toBe(first)
    expect(registry.get(first[0].id)).toBe(first[0])
    expect(requests).toBe(1)
  })

  it('subtracts Age from max-age and refetches after the remaining freshness expires', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    headers = {
      'Cache-Control': 'max-age=60',
      Age: '58',
      Date: new Date(now).toUTCString(),
    }
    const registry = getAssetRegistry(client(), 'lighter')
    const first = await registry.sync()
    expect(await registry.sync()).toBe(first)
    clock.mockReturnValue(now + 2001)
    const refreshed = await registry.sync()
    expect(refreshed[0].id).not.toBe(first[0].id)
    expect(requests).toBe(2)
  })

  it.each<Record<string, string>>([
    { 'Cache-Control': 'max-age=60', Age: '60' },
    { 'Cache-Control': 'no-store, max-age=60' },
    { 'Cache-Control': 'no-cache, max-age=60' },
    { 'Cache-Control': 'no-cache="set-cookie", max-age=60' },
    { 'Cache-Control': 'max-age=60', Vary: '*' },
    { 'Cache-Control': 'max-age=60', Date: new Date(0).toUTCString() },
    { 'Cache-Control': 'max-age=60, max-age=120' },
    { 'Cache-Control': 'max-age="60' },
    { 'Cache-Control': 'max-age=60', Age: 'invalid' },
    {},
  ])('does not reuse an uncacheable response: %j', async (responseHeaders) => {
    headers = responseHeaders
    const registry = getAssetRegistry(client(), 'lighter')
    const first = await registry.sync()
    const second = await registry.sync()
    expect(second[0].id).not.toBe(first[0].id)
    expect(requests).toBe(2)
  })

  it('scopes fresh snapshots to each client, provider and backend URL', async () => {
    const sdk = client(baseUrl, 'first')
    const registries = [
      getAssetRegistry(sdk, 'lighter'),
      getAssetRegistry(sdk, 'hyperliquid'),
      getAssetRegistry(client(baseUrl, 'second'), 'lighter'),
      getAssetRegistry(client(`${baseUrl}/other`, 'first'), 'lighter'),
    ]
    const snapshots = await Promise.all(
      registries.map((registry) => registry.sync())
    )
    expect(new Set(snapshots.map((items) => items[0].id)).size).toBe(4)
    const again = await Promise.all(
      registries.map((registry) => registry.sync())
    )
    expect(again.map((items) => items[0].id)).toEqual(
      snapshots.map((items) => items[0].id)
    )
    expect(requests).toBe(4)
  })

  it('runs request interception on every sync and keeps varying request identities separate', async () => {
    let identity = 'alice'
    let intercepted = 0
    headers.Vary = 'x-identity'
    const sdk = createPerpsClient({
      apiUrl: baseUrl,
      retry: false,
      requestInterceptor: (_url, options) => {
        intercepted++
        return {
          ...options,
          headers: { ...options.headers, 'x-identity': identity },
        }
      },
    })
    const registry = getAssetRegistry(sdk, 'lighter')
    expect((await registry.sync())[0].id).toContain(':alice:')
    identity = 'bob'
    expect((await registry.sync())[0].id).toContain(':bob:')
    expect(intercepted).toBe(2)
  })

  it('does not collapse concurrent intercepted requests with different identities', async () => {
    let identity = 'alice'
    const sdk = createPerpsClient({
      apiUrl: baseUrl,
      retry: false,
      requestInterceptor: (_url, options) => ({
        ...options,
        headers: { ...options.headers, 'x-identity': identity },
      }),
    })
    const registry = getAssetRegistry(sdk, 'lighter')
    const alice = registry.sync()
    identity = 'bob'
    const bob = registry.sync()
    expect((await alice)[0].id).toContain(':alice:')
    expect((await bob)[0].id).toContain(':bob:')
    expect(requests).toBe(2)
  })

  it('shares concurrent refreshes for the same request identity', async () => {
    const registry = getAssetRegistry(client(), 'lighter')
    const [first, second, third] = await Promise.all([
      registry.sync(),
      registry.sync(),
      registry.sync(),
    ])
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(requests).toBe(1)
  })

  it('does not retain failed JSON decoding as a fresh snapshot', async () => {
    const normalResponse = respond
    respond = (_request, response) => {
      requests++
      response.writeHead(200, { 'Cache-Control': 'max-age=60' })
      response.end('{')
    }
    const registry = getAssetRegistry(client(), 'lighter')
    await expect(registry.sync()).rejects.toThrow()
    respond = normalResponse
    const recovered = await registry.sync()
    expect(await registry.sync()).toBe(recovered)
    expect(requests).toBe(2)
  })

  it('bypasses reuse for custom fetch implementations with dynamic request identity', async () => {
    let identity = 'alice'
    const sdk = createPerpsClient({
      apiUrl: baseUrl,
      retry: false,
      fetch: (url, options) => {
        const requestHeaders = new Headers(options?.headers)
        requestHeaders.set('x-identity', identity)
        return fetch(url, { ...options, headers: requestHeaders })
      },
    })
    const registry = getAssetRegistry(sdk, 'lighter')
    const alice = registry.sync()
    identity = 'bob'
    const bob = registry.sync()
    expect((await alice)[0].id).toContain(':alice:')
    expect((await bob)[0].id).toContain(':bob:')
    expect(requests).toBe(2)
  })

  it('rejects an expired refresh failure instead of serving stale data and retries the next sync', async () => {
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const registry = getAssetRegistry(client(), 'lighter')
    const first = await registry.sync()
    clock.mockReturnValue(now + 61000)
    status = 503
    await expect(registry.sync()).rejects.toThrow()
    expect(registry.assets).toBe(first)
    status = 200
    expect((await registry.sync())[0].id).not.toBe(first[0].id)
    expect(requests).toBe(3)
  })
})
