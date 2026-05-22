import { PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { PROVIDER_KEY } from '../constants.js'

export interface InfoRequestOptions {
  signal?: AbortSignal
}

/**
 * POST to the Hyperliquid `/info` endpoint and return the parsed JSON body.
 *
 * Direct-to-venue: no proxy, no AJV validation, no cache. The caller's type
 * parameter is trusted; consumers should treat the response shape as
 * upstream-controlled and normalise into `@lifi/perps-types` shapes before
 * surfacing.
 *
 * Non-2xx responses raise a {@link PerpsError} with the Hyperliquid provider key.
 */
export async function infoRequest<T>(
  apiUrl: string,
  body: Record<string, unknown>,
  options?: InfoRequestOptions
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (error) {
    const err = new PerpsError(
      PerpsErrorCode.ServerError,
      error instanceof Error ? error.message : 'Hyperliquid info request failed'
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  if (!response.ok) {
    const err = new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      `Hyperliquid info request failed: ${response.status}`
    )
    err.tool = PROVIDER_KEY
    throw err
  }

  return (await response.json()) as T
}
