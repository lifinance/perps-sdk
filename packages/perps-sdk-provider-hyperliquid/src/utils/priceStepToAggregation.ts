/** Significant-figure bounds Hyperliquid's `l2Book` accepts; `undefined` is full precision. */
const HL_MIN_SIG_FIGS = 2
const HL_MAX_SIG_FIGS = 5
/** Mantissa sub-steps HL honours, but only when `nSigFigs === 5`. */
const HL_MANTISSA_VALUES: readonly [number, ...number[]] = [1, 2, 5]

/** Snap a leading-digit ratio to the nearest mantissa HL accepts (1, 2 or 5). */
function snapToMantissa(ratio: number): number {
  let closest = HL_MANTISSA_VALUES[0]
  for (const m of HL_MANTISSA_VALUES) {
    if (Math.abs(ratio - m) < Math.abs(ratio - closest)) {
      closest = m
    }
  }
  return closest
}

/**
 * Map a desired price `step` to Hyperliquid's server-side aggregation hint
 * `(nSigFigs, mantissa)` against the order of magnitude of `referencePrice`
 * (the market's mark price gives the digit count). HL buckets the book to
 * `nSigFigs` significant figures, so the figures resolving a price to `step`
 * granularity are `floor(log10(referencePrice)) - floor(log10(step)) + 1`.
 *
 * Returns `{}` (full precision) when the step is finer than HL's 5-sig-fig
 * grid or the inputs are unusable; clamps to {@link HL_MIN_SIG_FIGS} when the
 * step is coarser than HL's lowest granularity. `mantissa` is emitted only for
 * a non-power-of-ten step that lands on the 5-sig-fig grid, since HL ignores
 * it below `nSigFigs === 5`.
 *
 * @public
 */
export function priceStepToAggregation(
  step: number,
  referencePrice: number
): { nSigFigs?: number; mantissa?: number } {
  if (!Number.isFinite(step) || step <= 0) {
    return {}
  }
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return {}
  }

  const stepExp = Math.floor(Math.log10(step))
  const priceExp = Math.floor(Math.log10(referencePrice))
  const nSigFigs = priceExp - stepExp + 1

  if (nSigFigs > HL_MAX_SIG_FIGS) {
    return {}
  }

  const clamped = Math.max(HL_MIN_SIG_FIGS, nSigFigs)
  const mantissa = snapToMantissa(step / 10 ** stepExp)
  if (clamped === HL_MAX_SIG_FIGS && mantissa !== 1) {
    return { nSigFigs: clamped, mantissa }
  }
  return { nSigFigs: clamped }
}
