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
  createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
    retry: false,
  })

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

  it('on a miss: warns once per id and does not refetch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const requests = serveAssets([{ assets: [USDC] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()

    expect(registry.get('1')).toBeUndefined()
    expect(registry.get('1')).toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(requests).toHaveLength(1)
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

  it('resolves distinct identities without matching duplicate display symbols', async () => {
    const first = {
      ...USDC,
      wireId: '0xfirst',
      l1Address: `0x${'aB'.repeat(20)}`,
    }
    const second = { ...ETH, displaySymbol: 'USDC', wireId: '0xsecond' }
    serveAssets([{ assets: [first, second] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()

    expect(registry.require('0')).toEqual(first)
    expect(registry.require('0xsecond', 'wireId')).toEqual(second)
    expect(
      registry.require(first.l1Address.toLowerCase(), 'l1Address')
    ).toEqual(first)
    expect(() => registry.require('USDC', 'wireId')).toThrow(
      /stale or mis-keyed/
    )
    expect(registry.get('0xFIRST', 'wireId')).toBeUndefined()
  })

  it('replaces primary and secondary identities together on refresh', async () => {
    const old = { ...USDC, wireId: 'old', l1Address: 'OldCaseSensitiveAddress' }
    const replacement = {
      ...USDC,
      wireId: 'new',
      l1Address: 'NewCaseSensitiveAddress',
    }
    serveAssets([{ assets: [old, ETH] }, { assets: [replacement] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()
    await registry.sync()

    expect(registry.get('1')).toBeUndefined()
    expect(registry.get('old', 'wireId')).toBeUndefined()
    expect(registry.get(old.l1Address, 'l1Address')).toBeUndefined()
    expect(registry.require('new', 'wireId')).toBe(registry.require('0'))
    expect(registry.require(replacement.l1Address, 'l1Address')).toBe(
      registry.require('0')
    )
    expect(
      registry.get(replacement.l1Address.toLowerCase(), 'l1Address')
    ).toBeUndefined()
  })

  it.each([
    'id',
    'wireId',
    'l1Address',
  ] as const)('retains the complete snapshot after a duplicate %s refresh fails', async (key) => {
    const original = {
      ...USDC,
      wireId: 'original',
      l1Address: 'original-address',
    }
    const duplicate = { ...ETH, [key]: original[key] }
    serveAssets([
      { assets: [original] },
      { assets: [original, duplicate] },
      { assets: [ETH] },
    ])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()

    await expect(registry.sync()).rejects.toThrow(/duplicate/)
    expect(registry.assets).toEqual([original])
    expect(registry.require('original', 'wireId')).toBe(registry.require('0'))
    expect(registry.require('original-address', 'l1Address')).toBe(
      registry.require('0')
    )

    await registry.sync()
    expect(registry.assets).toEqual([ETH])
    expect(registry.get('original', 'wireId')).toBeUndefined()
  })

  it('shares a concurrent refresh and exposes the same asset through each index', async () => {
    const indexed = { ...USDC, wireId: 'wire' }
    const requests = serveAssets([{ assets: [indexed] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    const first = registry.sync()
    const second = registry.sync()
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(requests).toHaveLength(1)
    expect(registry.require('wire', 'wireId')).toBe(registry.require('0'))
  })

  it('removes optional identities when the replacement asset omits them', async () => {
    serveAssets([
      { assets: [{ ...USDC, wireId: 'old', l1Address: 'old-address' }] },
      { assets: [USDC] },
    ])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()
    await registry.sync()
    expect(registry.require('0')).toEqual(USDC)
    expect(registry.get('old', 'wireId')).toBeUndefined()
    expect(registry.get('old-address', 'l1Address')).toBeUndefined()
  })

  it('preserves the previous snapshot when the asset fetch fails', async () => {
    serveAssets([{ assets: [{ ...USDC, wireId: 'wire' }] }])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await registry.sync()
    server.use(
      http.get(`${DEFAULT_API_URL}/assets`, () => HttpResponse.error())
    )
    await expect(registry.sync()).rejects.toThrow()
    expect(registry.require('wire', 'wireId')).toBe(registry.require('0'))
  })

  it('rejects case-equivalent EVM addresses as duplicate identities', async () => {
    serveAssets([
      {
        assets: [
          { ...USDC, l1Address: `0x${'ab'.repeat(20)}` },
          { ...ETH, l1Address: `0x${'AB'.repeat(20)}` },
        ],
      },
    ])
    const registry = getAssetRegistry(freshClient(), 'lighter')
    await expect(registry.sync()).rejects.toThrow(/duplicate l1Address/)
    expect(registry.assets).toEqual([])
  })
})
