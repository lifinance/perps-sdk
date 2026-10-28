import { createWarnOnce, getDefaultMarketId } from '@lifi/perps-sdk'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoBookSnapshot } from '../types/ws.js'
import type { OndoApiClient } from '../utils/apiClient.js'

const ONDO_SERVER_CLOCK_TTL_MS = 60_000

const SYNC_FAILED = `[${ONDO_PROVIDER_KEY}] clock sync failed, signing with the client clock`

/**
 * Ondo's clock as seen from the client, for HMAC timestamps. Ondo rejects a
 * timestamp more than 1s ahead of its clock or 10s behind it.
 *
 * @internal
 */
export class OndoServerClock {
  private offsetMs: number | undefined
  private syncedAtMs = Number.NEGATIVE_INFINITY
  private inflight: Promise<void> | undefined
  private readonly warnOnce = createWarnOnce()

  constructor(private readonly client: () => OndoApiClient) {}

  /**
   * Measure the clock offset unless a measurement is younger than one minute.
   * A failed measurement keeps the previous offset and never rejects.
   */
  sync(): Promise<void> {
    if (Date.now() - this.syncedAtMs < ONDO_SERVER_CLOCK_TTL_MS) {
      return Promise.resolve()
    }
    this.inflight ??= this.measure().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  /** The client clock moved by the last measured offset; the client clock before any measurement. */
  estimateServerTimeMs(): number {
    return Date.now() + (this.offsetMs ?? 0)
  }

  private async measure(): Promise<void> {
    let snapshot: Pick<OndoBookSnapshot, 'time'>
    try {
      // Ondo has no time endpoint, and browsers hide the cross-origin `Date`
      // header, so the depth snapshot time is the server clock.
      snapshot = await this.client().get<typeof snapshot>('/v1/perps/depth', {
        params: { market: getDefaultMarketId(ONDO_PROVIDER_KEY), depth: 1 },
      })
    } catch (error) {
      this.warnOnce('request', `${SYNC_FAILED}: ${String(error)}`)
      return
    }
    const receivedAtMs = Date.now()
    const serverTimeMs = Date.parse(snapshot.time)
    if (!Number.isFinite(serverTimeMs)) {
      this.warnOnce('time', `${SYNC_FAILED}: invalid depth time`)
      return
    }
    // Against the receive time the offset errs behind the server, the side
    // Ondo's window tolerates.
    this.offsetMs = serverTimeMs - receivedAtMs
    this.syncedAtMs = receivedAtMs
  }
}
