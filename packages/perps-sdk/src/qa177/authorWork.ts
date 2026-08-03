// QA-177 decoy: stands in for the PR author's own change.
export function roundToTick(price: number, tick: number): number {
  if (tick <= 0) {
    throw new RangeError(`tick must be positive, got ${tick}`);
  }
  return Math.round(price / tick) * tick;
}
