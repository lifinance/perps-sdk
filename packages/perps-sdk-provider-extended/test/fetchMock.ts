import { vi } from 'vitest'

export interface RecordedRequest {
  url: string
  method: string
  /** Header names in lower case. */
  headers: Record<string, string>
  body: unknown
}

type Answer = { status: number; body: string } | Error

/** A `fetch` that answers in order and records each request. */
export function createFetchMock(answers: Answer[]) {
  const requests: RecordedRequest[] = []
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const answer = answers[requests.length - 1]
    if (answer === undefined) {
      throw new Error(`Unexpected request ${requests.length}: ${String(input)}`)
    }
    if (answer instanceof Error) {
      throw answer
    }
    return new Response(answer.body, { status: answer.status })
  })
  return { fetchImpl, requests }
}

export const okAnswer = (data: unknown) => ({
  status: 200,
  body: JSON.stringify({ status: 'OK', data }),
})

export const errorAnswer = (status: number, code: number, message: string) => ({
  status,
  body: JSON.stringify({ status: 'ERROR', error: { code, message } }),
})
