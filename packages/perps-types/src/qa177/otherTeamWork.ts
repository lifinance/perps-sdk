// QA-177 decoy: stands in for ANOTHER developer's commit, landing on the base branch
// after the PR was first reviewed. This is the Earn-work analogue from jumper-frontend#3103.
// It must never appear in the PR author's re-review delta.
export type FundingWindow = { startMs: number; endMs: number };

export function isWithinFundingWindow(nowMs: number, w: FundingWindow): boolean {
  return nowMs >= w.startMs && nowMs < w.endMs;
}
