import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { errorCodeFromStatus } from './errorCodeFromStatus.js'

describe('errorCodeFromStatus', () => {
  it('resolves a 429 to RateLimitExceeded', () => {
    expect(errorCodeFromStatus(429, PerpsErrorCode.DefaultError)).toBe(
      PerpsErrorCode.RateLimitExceeded
    )
  })

  const fallbackStatuses = [400, 401, 403, 404, 418, 500, 502, 503, 504]

  it.each(fallbackStatuses)('takes the fallback for status %i', (status) => {
    expect(errorCodeFromStatus(status, PerpsErrorCode.ThirdPartyError)).toBe(
      PerpsErrorCode.ThirdPartyError
    )
  })

  it('lets a boundary claim its own statuses', () => {
    const statusCodes = {
      401: PerpsErrorCode.Unauthorized,
      403: PerpsErrorCode.AgentUnauthorized,
    }

    expect(
      errorCodeFromStatus(401, PerpsErrorCode.ThirdPartyError, statusCodes)
    ).toBe(PerpsErrorCode.Unauthorized)
    expect(
      errorCodeFromStatus(403, PerpsErrorCode.ThirdPartyError, statusCodes)
    ).toBe(PerpsErrorCode.AgentUnauthorized)
    expect(
      errorCodeFromStatus(500, PerpsErrorCode.ThirdPartyError, statusCodes)
    ).toBe(PerpsErrorCode.ThirdPartyError)
  })

  it('keeps RateLimitExceeded when a boundary claims the 429', () => {
    expect(
      errorCodeFromStatus(429, PerpsErrorCode.DefaultError, {
        429: PerpsErrorCode.ThirdPartyError,
      })
    ).toBe(PerpsErrorCode.RateLimitExceeded)
  })
})
