/**
 * Options shared by the human-facing display formatters.
 *
 * @public
 */
export interface FormatOptions {
  /** Fixed number of decimal places. Defaults are per-formatter. */
  decimals?: number
  /** Rendered when the value is null/undefined/NaN/non-finite. Defaults to `'—'`. */
  placeholder?: string
  /** BCP 47 locale controlling digit grouping and separators (e.g. `'en-US'`). */
  locale?: string
}

const DEFAULT_PLACEHOLDER = '—'

type FormatInput = number | string | null | undefined

/**
 * Tolerantly coerce a display input to a finite number.
 *
 * Strips `$`, `,`, and surrounding whitespace from strings. Returns `null`
 * when the value is null/undefined/blank or does not resolve to a finite
 * number, so callers can render a placeholder instead of `$0.00` or `$NaN`.
 */
function toFiniteNumber(value: FormatInput): number | null {
  let n: number
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '')
    if (!cleaned) {
      return null
    }
    n = Number(cleaned)
  } else if (typeof value === 'number') {
    n = value
  } else {
    return null
  }
  return Number.isFinite(n) ? n : null
}

/**
 * Round to `decimals` then split into a sign (`'-'` or `''`) and the
 * locale-formatted absolute body. Deriving the sign from the rounded value
 * avoids `-$0.00` for values that round to zero.
 */
function signAndBody(
  n: number,
  decimals: number,
  locale: string | undefined,
  grouping: boolean
): { sign: '-' | ''; body: string } {
  const rounded = Number(n.toFixed(decimals))
  const sign = rounded < 0 ? '-' : ''
  const body = Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  })
  return { sign, body }
}

/**
 * Auto-detect a sensible number of decimal places from a value's magnitude:
 * `>=1` → 2, `>=0.1` → 4, `>=0.01` → 5, otherwise 6.
 */
function autoDecimals(abs: number): number {
  if (abs >= 1) {
    return 2
  }
  if (abs >= 0.1) {
    return 4
  }
  if (abs >= 0.01) {
    return 5
  }
  return 6
}

/**
 * Format a USD value, unsigned: `$1,234.50`, `-$1,500.00`, `$0.00`.
 *
 * Two decimal places with locale digit grouping. Negatives place the `-`
 * before the `$`. Null/undefined/non-finite input renders the placeholder.
 *
 * @public
 */
export function formatUsd(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const { decimals = 2, placeholder = DEFAULT_PLACEHOLDER, locale } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const { sign, body } = signAndBody(n, decimals, locale, true)
  return `${sign}$${body}`
}

/**
 * Format a USD value with an explicit sign: `+$1.43`, `-$1.43`, `$0.00`.
 *
 * The sign is derived after rounding, so sub-cent magnitudes render `$0.00`
 * (no spurious `+`/`-`). Null/undefined/non-finite input renders the
 * placeholder.
 *
 * @public
 */
export function formatSignedUsd(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const { decimals = 2, placeholder = DEFAULT_PLACEHOLDER, locale } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const rounded = Number(n.toFixed(decimals))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  const body = Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  })
  return `${sign}$${body}`
}

/**
 * Format a percentage with an explicit sign and no grouping: `+1.43%`,
 * `-1.43%`, `0.00%`.
 *
 * The sign is derived after rounding, so sub-threshold magnitudes render
 * `0.00%`. Null/undefined/non-finite input renders the placeholder.
 *
 * @public
 */
export function formatSignedPercent(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const { decimals = 2, placeholder = DEFAULT_PLACEHOLDER, locale } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const rounded = Number(n.toFixed(decimals))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : ''
  const body = Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  })
  return `${sign}${body}%`
}

/**
 * Format a price, unsigned, with decimals auto-detected from magnitude:
 * `$1,234.50`, `$0.1234`, `-$1,500.00`.
 *
 * Decimals follow {@link autoDecimals} unless `options.decimals` is given.
 * Grouping applies once the absolute value reaches 1000. Negatives place the
 * `-` before the `$`. Null/undefined/non-finite input renders the placeholder.
 *
 * @public
 */
export function formatPrice(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const { placeholder = DEFAULT_PLACEHOLDER, locale } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const abs = Math.abs(n)
  const decimals = options.decimals ?? autoDecimals(abs)
  const { sign, body } = signAndBody(n, decimals, locale, abs >= 1000)
  return `${sign}$${body}`
}

/**
 * Format a USD value compactly with a `B`/`M`/`K` suffix: `$1.23B`, `$45.6M`,
 * `$789.0K`, `$12.34`.
 *
 * Negatives place the `-` before the `$`. Null/undefined/non-finite input
 * renders the placeholder.
 *
 * @public
 */
export function formatCompactUsd(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const { decimals = 2, placeholder = DEFAULT_PLACEHOLDER } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(decimals)}B`
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(decimals)}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(decimals)}K`
  }
  return `${sign}$${abs.toFixed(decimals)}`
}
