import type { Market } from '@lifi/perps-types'
import { vi } from 'vitest'

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
 * `getMarket` filters by the `marketIds` query param — and resolves each
 * Hyperliquid `/info` POST from `responses` keyed by the body's `type` field.
 * Only `/info` requests are recorded. Unknown `type` values raise so tests
 * can't rely on default fixtures.
 */
export function installInfoFetchMock(
  responses: Record<string, unknown>,
  markets: Market[] = []
): {
  requests: RecordedRequest[]
  restore: () => void
} {
  const requests: RecordedRequest[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('/markets')) {
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
      return jsonResponse(responses[type])
    })

  return {
    requests,
    restore: () => {
      spy.mockRestore()
    },
  }
}
