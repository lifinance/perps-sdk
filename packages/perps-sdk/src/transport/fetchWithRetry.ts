import { sleep } from '../utils/sleep.js'
import type { ResolvedRetryPolicy, RetryClassification } from './retryPolicy.js'

export interface FetchWithRetryOptions {
  policy: ResolvedRetryPolicy
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/**
 * Wrap `fetch` with policy-driven retry. Honors `Retry-After` (when present
 * and `respectRetryAfter` is true), otherwise falls back to exponential
 * backoff with full jitter, capped by `maxDelayMs`. Network errors (thrown
 * `fetch` rejections) are treated as `retry-network` — same retry budget as
 * 5xx. An aborted signal short-circuits without further attempts.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: FetchWithRetryOptions
): Promise<Response> {
  const { policy, fetchImpl = fetch, signal } = options
  const mergedInit: RequestInit = signal ? { ...init, signal } : (init ?? {})

  let attempt = 0
  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    }

    let response: Response | undefined
    let networkError: unknown
    try {
      response = await fetchImpl(input, mergedInit)
    } catch (error) {
      networkError = error
    }

    if (response?.ok) {
      return response
    }

    const classification: RetryClassification = response
      ? policy.classify({ response })
      : 'retry-network'

    const attemptsRemaining = policy.maxAttempts - attempt - 1
    const isRetriable = classification !== 'fail' && attemptsRemaining > 0

    if (!isRetriable) {
      if (response) {
        return response
      }
      throw networkError
    }

    if (policy.shouldRetry) {
      const ok = await policy.shouldRetry({
        attempt,
        response,
        error: networkError,
        classification,
      })
      if (!ok) {
        if (response) {
          return response
        }
        throw networkError
      }
    }

    const delayMs = computeDelay(policy, attempt, response)
    if (delayMs > 0) {
      await sleep(delayMs)
    }
    attempt++
  }
}

function computeDelay(
  policy: ResolvedRetryPolicy,
  attempt: number,
  response: Response | undefined
): number {
  if (policy.respectRetryAfter && response) {
    const header = response.headers.get('Retry-After')
    if (header) {
      const parsed = parseRetryAfter(header)
      if (parsed !== undefined) {
        return Math.min(parsed, policy.maxDelayMs)
      }
    }
  }
  const exp = policy.baseDelayMs * 2 ** attempt
  const capped = Math.min(exp, policy.maxDelayMs)
  return Math.floor(Math.random() * capped)
}

function parseRetryAfter(header: string): number | undefined {
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }
  return undefined
}
