/**
 * Frame semantics of a {@link DecodeChain}:
 * - `'every'`: every frame decodes and applies in arrival order — required for
 *   delta-carrying channels, where dropping a frame corrupts downstream state.
 * - `'latest'`: frames queued behind an in-flight decode coalesce to the
 *   newest — for snapshot-like channels, where a newer frame supersedes
 *   anything still waiting.
 */
export type DecodeChainMode = 'every' | 'latest'

/**
 * Serializes async WS frame decodes so results apply in arrival order.
 * In `'latest'` mode a backlog (e.g. queued behind a main-thread stall)
 * collapses to its newest frame instead of replaying every stale decode.
 * Decode failures are reported to `onError` and never break the chain.
 */
export class DecodeChain {
  private tail: Promise<void> = Promise.resolve()
  private queued: (() => Promise<void>) | undefined

  constructor(
    private readonly mode: DecodeChainMode,
    private readonly onError: (error: unknown) => void
  ) {}

  push(decode: () => Promise<void>): void {
    if (this.mode === 'every') {
      this.tail = this.tail.then(decode).catch(this.onError)
      return
    }
    const drainScheduled = this.queued !== undefined
    this.queued = decode
    if (drainScheduled) {
      return
    }
    this.tail = this.tail
      .then(() => {
        const next = this.queued
        this.queued = undefined
        return next?.()
      })
      .catch(this.onError)
  }

  /**
   * Detach on connection teardown: drops the queued latest-mode decode and
   * starts subsequent pushes on a fresh chain. A decode already in flight
   * still settles.
   */
  reset(): void {
    this.tail = Promise.resolve()
    this.queued = undefined
  }
}
