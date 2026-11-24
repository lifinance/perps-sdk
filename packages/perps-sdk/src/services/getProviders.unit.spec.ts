import type { ProviderCategory, ProvidersResponse } from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockProviders, server } from '../../test/handlers.js'
import {
  createPerpsClient,
  DEFAULT_API_URL,
} from '../client/createPerpsClient.js'
import { getProviders } from './getProviders.js'

describe('getProviders', () => {
  const client = createPerpsClient({
    integrator: 'test-app',
    apiKey: 'test-key',
  })

  it('should return list of providers', async () => {
    const result = await getProviders(client)

    expect(result).toEqual(mockProviders)
    expect(result.providers).toHaveLength(2)
    expect(result.providers.map((p) => p.key)).toEqual([
      'hyperliquid',
      'lighter',
    ])
  })

  it('should include setup descriptors for each provider', async () => {
    const result = await getProviders(client)

    expect(result.providers[0].setup).toBeDefined()
    expect(result.providers[0].setup).toHaveLength(3)
    expect(result.providers[0].setup.map((d) => d.options !== null)).toEqual([
      false,
      false,
      true,
    ])
  })

  describe('collateralLedgerDecimals', () => {
    const usdc = {
      providerId: 'hyperliquid',
      id: '0',
      displaySymbol: 'USDC',
      logoURI: 'https://example.com/usdc.png',
      decimals: 8,
    }

    const serveCategories = (categories: ProviderCategory[]) => {
      const served: ProvidersResponse = {
        providers: [{ ...mockProviders.providers[0], categories }],
      }
      server.use(
        http.get(`${DEFAULT_API_URL}/providers`, () =>
          HttpResponse.json(served)
        )
      )
    }

    it('keeps the ledger precision that the backend returns', async () => {
      serveCategories([
        { id: 'hyperliquid', quoteAsset: usdc, collateralLedgerDecimals: 6 },
        { id: 'spot', quoteAsset: null },
      ])

      const [category, spot] = (await getProviders(client)).providers[0]
        .categories

      expect(category.collateralLedgerDecimals).toBe(6)
      expect(category.quoteAsset?.decimals).toBe(8)
      expect(spot).toEqual({ id: 'spot', quoteAsset: null })
    })

    it('does not take a value from quoteAsset.decimals when the field is absent', async () => {
      serveCategories([{ id: 'hyperliquid', quoteAsset: usdc }])

      const [category] = (await getProviders(client)).providers[0].categories

      expect(category).toEqual({ id: 'hyperliquid', quoteAsset: usdc })
      expect(category).not.toHaveProperty('collateralLedgerDecimals')
    })
  })

  it('should support AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      getProviders(client, { signal: controller.signal })
    ).rejects.toThrow()
  })
})
