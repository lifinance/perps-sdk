// QA-177 decoy: stands in for the PR author's own change.
export function roundToTick(price: number, tick: number): number {
  return Math.round(price / tick) * tick;
}
