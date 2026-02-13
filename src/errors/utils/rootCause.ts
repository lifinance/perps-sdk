/**
 * Get the root cause of an error by following the cause chain.
 *
 * @param error - The error to get the root cause of
 * @returns The root cause error, or the original error if no cause chain
 *
 * @example
 * ```ts
 * const wrapper = new PerpsSDKError(new HTTPError(response, url))
 * const root = getRootCause(wrapper) // Returns the HTTPError
 * ```
 */
export function getRootCause(error: Error): Error {
  let current: Error = error
  let iterations = 0
  const maxIterations = 100 // Prevent infinite loops

  while (current.cause instanceof Error && iterations < maxIterations) {
    current = current.cause
    iterations++
  }

  return current
}

/**
 * Get the message from the root cause of an error.
 *
 * @param error - The error to get the root cause message from
 * @returns The root cause message
 *
 * @example
 * ```ts
 * const wrapper = new PerpsSDKError(new HTTPError(response, url))
 * const message = getRootCauseMessage(wrapper) // Returns the HTTPError's message
 * ```
 */
export function getRootCauseMessage(error: Error): string {
  return getRootCause(error).message
}

/**
 * Get the full error chain as an array.
 *
 * @param error - The error to get the chain from
 * @returns Array of errors from outermost to root cause
 *
 * @example
 * ```ts
 * const chain = getErrorChain(sdkError)
 * // [PerpsSDKError, HTTPError, ...]
 * ```
 */
export function getErrorChain(error: Error): Error[] {
  const chain: Error[] = [error]
  let current = error
  let iterations = 0
  const maxIterations = 100

  while (current.cause instanceof Error && iterations < maxIterations) {
    chain.push(current.cause)
    current = current.cause
    iterations++
  }

  return chain
}

/**
 * Check if an error chain contains an error of a specific type.
 *
 * @param error - The error to check
 * @param ErrorClass - The error class to look for
 * @returns True if the chain contains an error of the specified type
 *
 * @example
 * ```ts
 * if (hasErrorType(error, HTTPError)) {
 *   // Handle HTTP error specifically
 * }
 * ```
 */
export function hasErrorType<T extends Error>(
  error: Error,
  ErrorClass: new (...args: any[]) => T
): boolean {
  const chain = getErrorChain(error)
  return chain.some((e) => e instanceof ErrorClass)
}

/**
 * Find the first error of a specific type in the error chain.
 *
 * @param error - The error to search
 * @param ErrorClass - The error class to find
 * @returns The first matching error, or undefined if not found
 *
 * @example
 * ```ts
 * const httpError = findErrorType(error, HTTPError)
 * if (httpError) {
 *   console.log(httpError.status)
 * }
 * ```
 */
export function findErrorType<T extends Error>(
  error: Error,
  ErrorClass: new (...args: any[]) => T
): T | undefined {
  const chain = getErrorChain(error)
  return chain.find((e): e is T => e instanceof ErrorClass)
}
