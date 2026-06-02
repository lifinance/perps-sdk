import { describe, expect, it, vi } from 'vitest'
import {
  DISABLED_RETRY,
  LIFI_RETRY_DEFAULTS,
  type ResolvedRetryPolicy,
  type RetryClassifyContext,
  resolveRetryPolicy,
} from './retryPolicy.js'

const responseWithStatus = (status: number): Response =>
  new Response(null, { status })

const classifyCtx = (status: number): RetryClassifyContext => ({
  response: responseWithStatus(status),
})

describe('LIFI_RETRY_DEFAULTS.classify', () => {
  it('classifies 429 as retry-rate-limit', () => {
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(429))).toBe(
      'retry-rate-limit'
    )
  })

  it('classifies 5xx as retry-server', () => {
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(500))).toBe('retry-server')
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(503))).toBe('retry-server')
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(599))).toBe('retry-server')
  })

  it('classifies non-retriable statuses as fail', () => {
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(400))).toBe('fail')
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(404))).toBe('fail')
    expect(LIFI_RETRY_DEFAULTS.classify(classifyCtx(499))).toBe('fail')
  })
})

describe('resolveRetryPolicy', () => {
  const base = LIFI_RETRY_DEFAULTS

  it('returns the base policy when config is undefined', () => {
    expect(resolveRetryPolicy(base, undefined, 'hyperliquid')).toBe(base)
  })

  it('returns DISABLED_RETRY when config is false', () => {
    expect(resolveRetryPolicy(base, false, 'hyperliquid')).toBe(DISABLED_RETRY)
  })

  describe('flat RetryPolicy applies to every provider', () => {
    it('merges a flat policy over the base for any providerKey', () => {
      const resolvedA = resolveRetryPolicy(
        base,
        { maxAttempts: 7 },
        'hyperliquid'
      )
      const resolvedB = resolveRetryPolicy(base, { maxAttempts: 7 }, 'lighter')

      expect(resolvedA.maxAttempts).toBe(7)
      expect(resolvedB.maxAttempts).toBe(7)
    })

    it('inherits unspecified base fields on a partial flat override', () => {
      const resolved = resolveRetryPolicy(base, { maxAttempts: 7 }, 'lifi')

      expect(resolved.enabled).toBe(true)
      expect(resolved.maxAttempts).toBe(7)
      expect(resolved.baseDelayMs).toBe(base.baseDelayMs)
      expect(resolved.maxDelayMs).toBe(base.maxDelayMs)
      expect(resolved.respectRetryAfter).toBe(base.respectRetryAfter)
      expect(resolved.classify).toBe(base.classify)
    })
  })

  describe('ProviderRetryConfig resolution order', () => {
    it('prefers config[providerKey] over config.default and base', () => {
      const resolved = resolveRetryPolicy(
        base,
        {
          default: { maxAttempts: 5 },
          hyperliquid: { maxAttempts: 9 },
        },
        'hyperliquid'
      )

      expect(resolved.maxAttempts).toBe(9)
    })

    it('falls back to config.default when providerKey is absent', () => {
      const resolved = resolveRetryPolicy(
        base,
        {
          default: { maxAttempts: 5 },
          hyperliquid: { maxAttempts: 9 },
        },
        'lighter'
      )

      expect(resolved.maxAttempts).toBe(5)
    })

    it('falls back to base when neither providerKey nor default is present', () => {
      const resolved = resolveRetryPolicy(
        base,
        { hyperliquid: { maxAttempts: 9 } },
        'lighter'
      )

      expect(resolved).toBe(base)
    })

    it('disables retries when config[providerKey] is false', () => {
      const resolved = resolveRetryPolicy(
        base,
        { default: { maxAttempts: 5 }, lighter: false },
        'lighter'
      )

      expect(resolved).toBe(DISABLED_RETRY)
    })

    it('disables retries when config.default is false and providerKey absent', () => {
      const resolved = resolveRetryPolicy(base, { default: false }, 'lighter')

      expect(resolved).toBe(DISABLED_RETRY)
    })

    it('treats a config that only carries provider keys as a ProviderRetryConfig', () => {
      const resolved = resolveRetryPolicy(
        base,
        { lifi: { baseDelayMs: 42 } },
        'lifi'
      )

      expect(resolved.baseDelayMs).toBe(42)
      expect(resolved.maxAttempts).toBe(base.maxAttempts)
    })
  })

  describe('mergePolicy via resolveRetryPolicy', () => {
    it('overrides each field independently and inherits the rest', () => {
      const override = {
        maxAttempts: 10,
        baseDelayMs: 100,
        maxDelayMs: 9_999,
        respectRetryAfter: false,
      }
      const resolved = resolveRetryPolicy(base, override, 'lifi')

      expect(resolved).toMatchObject({
        enabled: true,
        maxAttempts: 10,
        baseDelayMs: 100,
        maxDelayMs: 9_999,
        respectRetryAfter: false,
      })
    })

    it('keeps base.classify when the override omits classify', () => {
      const resolved = resolveRetryPolicy(base, { maxAttempts: 4 }, 'lifi')

      expect(resolved.classify).toBe(base.classify)
    })

    it('uses the provider classify when it returns a classification', () => {
      const resolved = resolveRetryPolicy(
        base,
        { classify: () => 'retry-network' },
        'lifi'
      )

      // 400 would be 'fail' under the base classifier; the override wins.
      expect(resolved.classify(classifyCtx(400))).toBe('retry-network')
    })

    it('defers to the base classifier when the provider classify returns undefined', () => {
      const customBase: ResolvedRetryPolicy = {
        ...base,
        classify: () => 'retry-server',
      }
      const resolved = resolveRetryPolicy(
        customBase,
        { classify: () => undefined },
        'lifi'
      )

      expect(resolved.classify(classifyCtx(200))).toBe('retry-server')
    })

    it('carries through a provider-supplied shouldRetry', () => {
      const shouldRetry = vi.fn(() => false)
      const resolved = resolveRetryPolicy(base, { shouldRetry }, 'lifi')

      expect(resolved.shouldRetry).toBe(shouldRetry)
    })
  })
})
