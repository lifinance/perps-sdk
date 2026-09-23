import type { Asset, Market, MarketContext, Provider } from '@lifi/perps-types'
import { vi } from 'vitest'
import { HYPERLIQUID_PROVIDER, USDC_ASSET } from './fixtures.js'

export interface RecordedRequest {
  url: string
  body: Record<string, unknown>
}

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/**
 * Install a `vi.spyOn(globalThis, 'fetch')` for account-read specs. Serves the
 * backend `/markets` GET route from `markets` (the enriched source of truth) —
 * `getMarket` filters by the `marketIds` query param — the `/marketsContext` GET
 * route from `prices`, the `/providers` GET route from `providers`, and
 * resolves each Hyperliquid POST from `responses` keyed by the body's `type`
 * field. A `Response` entry or `providers` value is served as-is, so a
 * spec can drive a non-2xx status. POSTs are recorded in `requests`; the
 * reference-data GET routes are recorded separately in `referenceRequests`, so
 * a spec can assert a filtered read skipped one. Unknown `type` values raise so
 * tests can't rely on default fixtures.
 */
export function installInfoFetchMock(
  responses: Record<string, unknown>,
  markets: Market[] = [],
  prices: MarketContext[] = [],
  assets: Asset[] = [USDC_ASSET],
  providers: Provider[] | Response = [HYPERLIQUID_PROVIDER]
): {
  requests: RecordedRequest[]
  referenceRequests: string[]
  restore: () => void
} {
  const requests: RecordedRequest[] = []
  const referenceRequests: string[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('/providers')) {
        referenceRequests.push(url)
        return providers instanceof Response
          ? providers.clone()
          : jsonResponse({ providers })
      }

      if (url.includes('/assets')) {
        referenceRequests.push(url)
        return jsonResponse({ assets })
      }

      if (url.includes('/marketsContext')) {
        referenceRequests.push(url)
        const marketIds = new URL(url).searchParams.get('marketIds')
        const filtered = marketIds
          ? prices.filter((p) => marketIds.split(',').includes(p.marketId))
          : prices
        return jsonResponse({ prices: filtered })
      }

      if (url.includes('/markets')) {
        referenceRequests.push(url)
        const marketIds = new URL(url).searchParams.get('marketIds')
        const filtered = marketIds
          ? markets.filter((m) => marketIds.split(',').includes(m.id))
          : markets
        return jsonResponse({ markets: filtered })
      }

      const body = JSON.parse((init?.body as string) ?? '{}') as Record<
        string,
        unknown
      >
      requests.push({ url, body })

      const type = body.type as string
      if (!(type in responses)) {
        throw new Error(`No mock response registered for /info type=${type}`)
      }
      const registered = responses[type]
      return registered instanceof Response
        ? registered.clone()
        : jsonResponse(registered)
    })

  return {
    requests,
    referenceRequests,
    restore: () => {
      spy.mockRestore()
    },
  }
}
