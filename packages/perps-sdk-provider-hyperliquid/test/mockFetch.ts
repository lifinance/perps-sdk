import { vi } from 'vitest'

export interface RecordedRequest {
  url: string
  body: Record<string, unknown>
}

/**
 * Install a `vi.spyOn(globalThis, 'fetch')` that resolves each `/info`
 * request from the supplied dictionary keyed by the body's `type` field.
 * Returns the recorded request list and a tear-down helper. Unknown `type`
 * values raise so tests can't accidentally rely on default fixtures.
 */
export function installInfoFetchMock(responses: Record<string, unknown>): {
  requests: RecordedRequest[]
  restore: () => void
} {
  const requests: RecordedRequest[] = []
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const body = JSON.parse((init?.body as string) ?? '{}') as Record<
        string,
        unknown
      >
      requests.push({ url, body })

      const type = body.type as string
      if (!(type in responses)) {
        throw new Error(`No mock response registered for /info type=${type}`)
      }

      const value = responses[type]
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

  return {
    requests,
    restore: () => {
      spy.mockRestore()
    },
  }
}
