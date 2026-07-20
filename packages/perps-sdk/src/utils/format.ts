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
  /**
   * Rounding applied when reducing to `decimals` places. Defaults to
   * `'halfUp'`. `'floor'` truncates toward zero (matching big.js `roundDown`),
   * so the rendered magnitude never exceeds the source — use it for readouts
   * validated against a ceiling (available balance, removable margin).
   */
  rounding?: RoundingMode
}

/** Rounding mode for {@link FormatOptions.rounding}. */
export type RoundingMode = 'halfUp' | 'floor'

const DEFAULT_PLACEHOLDER = '—'

type FormatInput = number | string | null | undefined

/**
 * Extra decimal places used to normalise IEEE-754 representation noise before
 * truncating. `toFixed` at this higher precision cleans values like
 * `0.28999999…` back to `0.29`; truncation then chops the guard digits.
 */
const FLOAT_GUARD_DIGITS = 9

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
 * Truncate a non-negative value toward zero to `decimals` places using its
 * decimal string, never float scaling. Representation noise is first
 * normalised by `toFixed` at {@link FLOAT_GUARD_DIGITS} extra precision, then
 * the guard digits are chopped: `99.999` at 2dp → `99.99`, `0.29` → `0.29`.
 */
function truncateAbs(abs: number, decimals: number): number {
  const s = abs.toFixed(Math.min(decimals + FLOAT_GUARD_DIGITS, 100))
  const dot = s.indexOf('.')
  const cut = decimals === 0 ? dot : dot + 1 + decimals
  return Number(s.slice(0, cut))
}

/**
 * Reduce `n` to `decimals` places then split into a sign and the
 * locale-formatted absolute body. The sign is derived from the reduced value
 * so magnitudes that collapse to zero render without a spurious `-`/`+`.
 * `signed` emits `+` for positives; `rounding` selects half-up or truncation.
 */
function signAndBody(
  n: number,
  decimals: number,
  locale: string | undefined,
  grouping: boolean,
  rounding: RoundingMode,
  signed: boolean
): { sign: '+' | '-' | ''; body: string } {
  const reduced =
    rounding === 'floor'
      ? (n < 0 ? -1 : 1) * truncateAbs(Math.abs(n), decimals)
      : Number(n.toFixed(decimals))
  const sign = reduced < 0 ? '-' : signed && reduced > 0 ? '+' : ''
  const body = Math.abs(reduced).toLocaleString(locale, {
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
 * Format a bare number, unsigned, with no currency symbol: `1,234.50`,
 * `-1,500.00`, `0.00`. The core the `$`/`%` formatters wrap; use it for
 * balance labels and symbol-suffixed amounts (`12.5 LIT`).
 *
 * Two decimal places with locale digit grouping by default. Negatives keep a
 * leading `-`. `rounding: 'floor'` truncates toward zero so the rendered
 * magnitude never exceeds the source (`99.999` at 2dp → `99.99`, `-99.999` →
 * `-99.99`). Null/undefined/non-finite input renders the placeholder.
 *
 * @public
 */
export function formatNumber(
  value: FormatInput,
  options: FormatOptions = {}
): string {
  const {
    decimals = 2,
    placeholder = DEFAULT_PLACEHOLDER,
    locale,
    rounding = 'halfUp',
  } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const { sign, body } = signAndBody(n, decimals, locale, true, rounding, false)
  return `${sign}${body}`
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
  const {
    decimals = 2,
    placeholder = DEFAULT_PLACEHOLDER,
    locale,
    rounding = 'halfUp',
  } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const { sign, body } = signAndBody(n, decimals, locale, true, rounding, false)
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
  const {
    decimals = 2,
    placeholder = DEFAULT_PLACEHOLDER,
    locale,
    rounding = 'halfUp',
  } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const { sign, body } = signAndBody(n, decimals, locale, true, rounding, true)
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
  const {
    decimals = 2,
    placeholder = DEFAULT_PLACEHOLDER,
    locale,
    rounding = 'halfUp',
  } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const { sign, body } = signAndBody(n, decimals, locale, false, rounding, true)
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
  const {
    placeholder = DEFAULT_PLACEHOLDER,
    locale,
    rounding = 'halfUp',
  } = options
  const n = toFiniteNumber(value)
  if (n === null) {
    return placeholder
  }
  const abs = Math.abs(n)
  const decimals = options.decimals ?? autoDecimals(abs)
  const { sign, body } = signAndBody(
    n,
    decimals,
    locale,
    abs >= 1000,
    rounding,
    false
  )
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
