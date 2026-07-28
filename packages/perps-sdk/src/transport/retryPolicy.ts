/**
 * Provider key for LI.FI-backend-proxied requests in a
 * {@link ProviderRetryConfig}.
 *
 * @public
 */
export const LIFI_REQUEST_KEY = 'lifi' as const

/**
 * Outcome of classifying a response/error for retry: the three `retry-*`
 * variants are retriable; `'fail'` is terminal.
 *
 * @public
 */
export type RetryClassification =
  | 'retry-rate-limit'
  | 'retry-server'
  | 'retry-network'
  | 'fail'

/**
 * Context passed to a {@link RetryPolicy.classify} callback.
 *
 * @public
 */
export interface RetryClassifyContext {
  /** Non-2xx response being classified for retry or terminal failure. */
  response: Response
}

/**
 * Context passed to a {@link RetryPolicy.shouldRetry} callback for each
 * attempt.
 *
 * @public
 */
export interface RetryAttemptContext {
  /** Zero-based attempt index for the response/error. */
  attempt: number
  /** Response received, when the attempt reached the server. */
  response?: Response
  /** Network error thrown before a response was received. */
  error?: unknown
  /** Classification returned by the policy's classifier. */
  classification: RetryClassification
}

/**
 * User-supplied retry tuning. All fields optional — anything left unset
 * inherits the built-in default for the target provider. `classify` returning
 * `undefined` defers to the base classifier; returning `'fail'` short-circuits
 * retry. `shouldRetry` runs after `classify` has already decided to retry and
 * gives a final yes/no per attempt.
 *
 * @public
 */
export interface RetryPolicy {
  /** Maximum total attempts, including the initial request. */
  maxAttempts?: number
  /** Initial exponential-backoff ceiling in milliseconds. */
  baseDelayMs?: number
  /** Maximum backoff delay in milliseconds. */
  maxDelayMs?: number
  /** Whether a valid `Retry-After` response header takes precedence. */
  respectRetryAfter?: boolean
  /** Classify a response; `undefined` delegates to the base classifier. */
  classify?: (ctx: RetryClassifyContext) => RetryClassification | undefined
  /** Final per-attempt veto after classification requests a retry. */
  shouldRetry?: (ctx: RetryAttemptContext) => boolean | Promise<boolean>
}

/**
 * A fully resolved retry policy with every field populated — the form
 * {@link fetchWithRetry} consumes.
 *
 * @public
 */
export interface ResolvedRetryPolicy {
  /** Whether retries are enabled. */
  enabled: boolean
  /** Maximum total attempts, including the initial request. */
  maxAttempts: number
  /** Initial exponential-backoff ceiling in milliseconds. */
  baseDelayMs: number
  /** Maximum backoff delay in milliseconds. */
  maxDelayMs: number
  /** Whether a valid `Retry-After` header is honored. */
  respectRetryAfter: boolean
  /** Final response classifier used for each failed attempt. */
  classify: (ctx: RetryClassifyContext) => RetryClassification
  /** Optional final veto after classification requests a retry. */
  shouldRetry?: (ctx: RetryAttemptContext) => boolean | Promise<boolean>
}

/**
 * Per-provider overrides keyed by the provider plugin's `type` (e.g. `'hyperliquid'`,
 * `'lighter'`), plus `'lifi'` for backend-proxied requests. `default` is the
 * fallback applied to any provider not explicitly listed.
 *
 * @public
 */
export interface ProviderRetryConfig {
  /** Fallback policy for providers without an explicit key. */
  default?: RetryPolicy | false
  /** Override keyed by provider type, or `lifi` for backend requests. */
  [providerKey: string]: RetryPolicy | false | undefined
}

/**
 * Top-level `retry` option: a flat {@link RetryPolicy} for all providers,
 * `false` to disable retries, or a per-provider {@link ProviderRetryConfig}.
 *
 * @public
 */
export type RetryConfig = RetryPolicy | false | ProviderRetryConfig

/**
 * Built-in default retry policy for LI.FI-backend requests.
 *
 * @public
 */
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

/**
 * A resolved policy that performs a single attempt with no retries.
 *
 * @public
 */
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
 *
 * @public
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
