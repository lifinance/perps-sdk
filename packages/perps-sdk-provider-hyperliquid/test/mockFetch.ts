import type { Asset } from '@lifi/perps-types'
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
 * backend `/assets` and `/assets/:assetId` GET routes from `assets` (the
 * enriched source of truth), and resolves each Hyperliquid `/info` POST from
 * `responses` keyed by the body's `type` field. Only `/info` requests are
 * recorded. Unknown `type` values raise so tests can't rely on default
 * fixtures.
 */
export function installInfoFetchMock(
  responses: Record<string, unknown>,
  assets: Asset[] = []
): {
  requests: RecordedRequest[]
  restore: () => void
} {
  const requests: RecordedRequest[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()

      const single = url.match(/\/assets\/([^/?]+)/)
      if (single) {
        const assetId = decodeURIComponent(single[1])
        const asset = assets.find((a) => a.assetId === assetId)
        return asset
          ? jsonResponse(asset)
          : jsonResponse(
              { code: 2023, message: `asset ${assetId} not found` },
              404
            )
      }
      if (url.includes('/assets')) {
        return jsonResponse({ assets })
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
