import type { DecimalString } from '@lifi/perps-types'
import Big from 'big.js'
import { decimalStringToBig } from './decimalStringToBig.js'

/**
 * Options shared by the human-facing display formatters.
 *
 * @public
 */
export interface FormatOptions {
  /** Fixed number of decimal places. Defaults are per-formatter. */
  decimals?: number
  /**
   * Rendered when the value is null, undefined, blank or a non-finite number.
   * A string that is not a decimal is shown unchanged. Defaults to `'—'`.
   */
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

/**
 * Rounding mode for {@link FormatOptions.rounding}.
 *
 * @public
 */
export type RoundingMode = 'halfUp' | 'floor'

const DEFAULT_PLACEHOLDER = '—'

type FormatInput = number | DecimalString | string | null | undefined

/**
 * Read a display input as a `Big`. `null` means the formatter renders the
 * placeholder; a string that does not match the decimal pattern is returned
 * unchanged for display.
 */
function toBig(value: FormatInput): Big | null | string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new Big(value) : null
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }
  try {
    return decimalStringToBig(value)
  } catch {
    return value
  }
}

function decimalSeparator(locale: string | undefined): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.5)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  )
}

/**
 * Reduce `value` to `decimals` places then split into a sign and the
 * locale-formatted absolute body. The sign is derived from the reduced value
 * so magnitudes that collapse to zero render without a spurious `-`/`+`.
 * `signed` emits `+` for positives; `rounding` selects half-up or truncation.
 */
function signAndBody(
  value: Big,
  decimals: number,
  locale: string | undefined,
  grouping: boolean,
  rounding: RoundingMode,
  signed: boolean
): { sign: '+' | '-' | ''; body: string } {
  const reduced = value.round(
    decimals,
    rounding === 'floor' ? Big.roundDown : Big.roundHalfUp
  )
  const sign = reduced.lt(0) ? '-' : signed && reduced.gt(0) ? '+' : ''
  const [integerPart = '0', fractionPart] = reduced
    .abs()
    .toFixed(decimals)
    .split('.')
  const integerBody = grouping
    ? BigInt(integerPart).toLocaleString(locale)
    : integerPart
  const body =
    fractionPart === undefined
      ? integerBody
      : `${integerBody}${decimalSeparator(locale)}${fractionPart}`
  return { sign, body }
}

/**
 * Auto-detect a sensible number of decimal places from a value's magnitude:
 * `>=1` → 2, `>=0.1` → 4, `>=0.01` → 5, otherwise 6.
 */
function autoDecimals(abs: Big): number {
  if (abs.gte(1)) {
    return 2
  }
  if (abs.gte('0.1')) {
    return 4
  }
  if (abs.gte('0.01')) {
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
  }
  const abs = n.abs()
  const decimals = options.decimals ?? autoDecimals(abs)
  const { sign, body } = signAndBody(
    n,
    decimals,
    locale,
    abs.gte(1000),
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
  const n = toBig(value)
  if (n === null) {
    return placeholder
  }
  if (typeof n === 'string') {
    return n
  }
  const sign = n.lt(0) ? '-' : ''
  const abs = n.abs()
  if (abs.gte(1_000_000_000)) {
    return `${sign}$${abs.div(1_000_000_000).toFixed(decimals)}B`
  }
  if (abs.gte(1_000_000)) {
    return `${sign}$${abs.div(1_000_000).toFixed(decimals)}M`
  }
  if (abs.gte(1_000)) {
    return `${sign}$${abs.div(1_000).toFixed(decimals)}K`
  }
  return `${sign}$${abs.toFixed(decimals)}`
}
