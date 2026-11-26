import { isAbortRejection } from '../transport/fetchWithRetry.js'
import { sleep } from './sleep.js'

/**
 * Options for {@link retryWithBackoff}.
 *
 * @public
 */
export interface RetryWithBackoffOptions {
  /** Maximum total attempts, including the first. */
  maxAttempts: number
  /** Delay before the first retry, in milliseconds. Each later delay doubles. */
  baseDelayMs: number
  /** Whether a failed attempt runs again. Default: every failure runs again. */
  shouldRetry?: (error: unknown) => boolean
  /** Abort signal; an abort rejects with its reason and stops the retries. */
  signal?: AbortSignal
}

/**
 * Run `run` until it resolves, with an exponential delay between attempts.
 * Rejects with the last error when the attempts run out or `shouldRetry`
 * refuses the error.
 *
 * @public
 */
export async function retryWithBackoff<T>(
  run: () => Promise<T>,
  options: RetryWithBackoffOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, shouldRetry = () => true, signal } = options
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (
        attempt >= maxAttempts ||
        isAbortRejection(error, signal) ||
        !shouldRetry(error)
      ) {
        throw error
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1), signal)
    }
  }
}
