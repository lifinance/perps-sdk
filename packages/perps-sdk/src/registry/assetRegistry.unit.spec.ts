import type { Asset, AssetsResponse } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getAssetRegistry } from './assetRegistry.js'

const asset = (id: string, displaySymbol: string): Asset => ({
  providerId: 'lighter',
  id,
  displaySymbol,
  logoURI: `https://example.com/${displaySymbol}.svg`,
})

const USDC = asset('0', 'USDC')
const ETH = asset('1', 'ETH')

/** Serve `responses` in order, recording each request's cache mode. */
const serveAssets = (responses: AssetsResponse[]) => {
  const requests: Array<{ provider: string | null; cache: RequestCache }> = []
  server.use(
    http.get(`${DEFAULT_API_URL}/assets`, ({ request }) => {
      requests.push({
        provider: new URL(request.url).searchParams.get('provider'),
        cache: request.cache,
      })
      const response =
        responses[Math.min(requests.length, responses.length) - 1]
      return HttpResponse.json(response)
    })
  )
  return requests
}

const freshClient = () =>
  createPerpsClient({ integrator: 'test-app', apiKey: 'test-key' })

describe('AssetRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('syncs the provider asset list and indexes by Asset.id', async () => {
    const requests = serveAssets([{ assets: [USDC, ETH] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')

    const assets = await registry.sync()

    expect(requests).toEqual([{ provider: 'lighter', cache: 'default' }])
    expect(assets).toEqual([USDC, ETH])
    expect(registry.assets).toEqual([USDC, ETH])
    expect(registry.get('1')).toEqual(ETH)
  })

  it('on a miss: warns once per id and refetches bypassing the HTTP cache', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = serveAssets([{ assets: [USDC] }, { assets: [USDC, ETH] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()

    expect(registry.get('1')).toBeUndefined()
    expect(registry.get('1')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => {
      expect(registry.get('1')).toEqual(ETH)
    })
    expect(requests).toHaveLength(2)
    expect(requests[1].cache).toBe('no-cache')
  })

  it('returns the same instance per (client, provider)', () => {
    const client = freshClient()

    expect(getAssetRegistry(client, 'lighter')).toBe(
      getAssetRegistry(client, 'lighter')
    )
    expect(getAssetRegistry(client, 'lighter')).not.toBe(
      getAssetRegistry(client, 'hyperliquid')
    )
  })
})
