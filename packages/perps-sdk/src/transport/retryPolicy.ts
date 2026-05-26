export const LIFI_REQUEST_KEY = 'lifi' as const

export type RetryClassification =
  | 'retry-rate-limit'
  | 'retry-server'
  | 'retry-network'
  | 'fail'

export interface RetryClassifyContext {
  response: Response
}

export interface RetryAttemptContext {
  attempt: number
  response?: Response
  error?: unknown
  classification: RetryClassification
}

/**
 * User-supplied retry tuning. All fields optional — anything left unset
 * inherits the built-in default for the target provider. `classify` returning
 * `undefined` defers to the base classifier; returning `'fail'` short-circuits
 * retry. `shouldRetry` runs after `classify` has already decided to retry and
 * gives a final yes/no per attempt.
 */
export interface RetryPolicy {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  respectRetryAfter?: boolean
  classify?: (ctx: RetryClassifyContext) => RetryClassification | undefined
  shouldRetry?: (ctx: RetryAttemptContext) => boolean | Promise<boolean>
}

export interface ResolvedRetryPolicy {
  enabled: boolean
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  respectRetryAfter: boolean
  classify: (ctx: RetryClassifyContext) => RetryClassification
  shouldRetry?: (ctx: RetryAttemptContext) => boolean | Promise<boolean>
}

/**
 * Per-provider overrides keyed by the provider plugin's `type` (e.g. `'hyperliquid'`,
 * `'lighter'`), plus `'lifi'` for backend-proxied requests. `default` is the
 * fallback applied to any provider not explicitly listed.
 */
export interface ProviderRetryConfig {
  default?: RetryPolicy | false
  [providerKey: string]: RetryPolicy | false | undefined
}

export type RetryConfig = RetryPolicy | false | ProviderRetryConfig

export const LIFI_RETRY_DEFAULTS: ResolvedRetryPolicy = {
  enabled: true,
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  respectRetryAfter: true,
  classify: ({ response }) => {
    if (response.status === 429) {
      return 'retry-rate-limit'
    }
    if (response.status >= 500 && response.status <= 599) {
      return 'retry-server'
    }
    return 'fail'
  },
}

export const DISABLED_RETRY: ResolvedRetryPolicy = {
  enabled: false,
  maxAttempts: 1,
  baseDelayMs: 0,
  maxDelayMs: 0,
  respectRetryAfter: false,
  classify: () => 'fail',
}

function isProviderRetryConfig(
  input: RetryPolicy | ProviderRetryConfig
): input is ProviderRetryConfig {
  if (
    'maxAttempts' in input ||
    'baseDelayMs' in input ||
    'maxDelayMs' in input ||
    'respectRetryAfter' in input ||
    'classify' in input ||
    'shouldRetry' in input
  ) {
    return false
  }
  return true
}

function mergePolicy(
  base: ResolvedRetryPolicy,
  override: RetryPolicy | false | undefined
): ResolvedRetryPolicy {
  if (override === false) {
    return DISABLED_RETRY
  }
  if (!override) {
    return base
  }
  return {
    enabled: true,
    maxAttempts: override.maxAttempts ?? base.maxAttempts,
    baseDelayMs: override.baseDelayMs ?? base.baseDelayMs,
    maxDelayMs: override.maxDelayMs ?? base.maxDelayMs,
    respectRetryAfter: override.respectRetryAfter ?? base.respectRetryAfter,
    classify: override.classify
      ? (ctx) => override.classify?.(ctx) ?? base.classify(ctx)
      : base.classify,
    shouldRetry: override.shouldRetry ?? base.shouldRetry,
  }
}

/**
 * Merge a user-supplied {@link RetryConfig} onto a provider's built-in default.
 * Resolution order when `config` is a {@link ProviderRetryConfig}:
 * `config[providerKey]` → `config.default` → `base`. A flat {@link RetryPolicy}
 * applies to every provider. `false` (at any level) disables retries entirely.
 */
export function resolveRetryPolicy(
  base: ResolvedRetryPolicy,
  config: RetryConfig | undefined,
  providerKey: string
): ResolvedRetryPolicy {
  if (config === undefined) {
    return base
  }
  if (config === false) {
    return DISABLED_RETRY
  }
  if (isProviderRetryConfig(config)) {
    const perProvider = config[providerKey]
    if (perProvider !== undefined) {
      return mergePolicy(base, perProvider)
    }
    if (config.default !== undefined) {
      return mergePolicy(base, config.default)
    }
    return base
  }
  return mergePolicy(base, config)
}
