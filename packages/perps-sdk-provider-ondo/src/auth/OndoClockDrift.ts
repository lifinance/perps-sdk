import { createWarnOnce, type StorageAdapter } from '@lifi/perps-sdk'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoStatus } from '../types/wire.js'
import type { OndoApiClient } from '../utils/apiClient.js'

// Drift belongs to the device, not to a wallet: one key per Ondo host.
const STORAGE_PREFIX = 'lifi-perps-ondo-clock-drift'

const MEASURE_FAILED = `[${ONDO_PROVIDER_KEY}] clock drift measurement failed, keeping the previous drift`

/**
 * The offset from the device clock to Ondo's clock, for HMAC timestamps:
 * negative when the device runs ahead, positive when it runs behind. Ondo
 * rejects a timestamp more than 1s ahead of its clock or 10s behind it, so the
 * drift is measured only after such a rejection.
 *
 * @internal
 */
export class OndoClockDrift {
  private driftMs: Promise<number> | undefined
  private readonly storageKey: string
  private readonly warnOnce = createWarnOnce()

  constructor(
    private readonly storage: StorageAdapter,
    baseUrl: string,
    private readonly client: () => OndoApiClient
  ) {
    this.storageKey = `${STORAGE_PREFIX}:${new URL(baseUrl).host}`
  }

  /** Ondo's clock as the device sees it, in Unix milliseconds. */
  async nowMs(): Promise<number> {
    this.driftMs ??= this.load()
    return Date.now() + (await this.driftMs)
  }

  /**
   * Read Ondo's `serverTime` and store the drift from the raw device clock.
   * Resolves `false`, with the drift unchanged, when the read fails.
   */
  async measure(): Promise<boolean> {
    let serverTimeMs: unknown
    try {
      const status = await this.client().get<Partial<OndoStatus> | null>(
        '/status'
      )
      serverTimeMs = status?.serverTime
    } catch (error) {
      this.warnOnce('request', `${MEASURE_FAILED}: ${String(error)}`)
      return false
    }
    if (typeof serverTimeMs !== 'number' || !Number.isFinite(serverTimeMs)) {
      this.warnOnce('time', `${MEASURE_FAILED}: invalid serverTime`)
      return false
    }
    const driftMs = serverTimeMs - Date.now()
    this.driftMs = Promise.resolve(driftMs)
    await this.storage.set(this.storageKey, String(driftMs))
    return true
  }

  private async load(): Promise<number> {
    const stored = Number(await this.storage.get(this.storageKey))
    return Number.isFinite(stored) ? stored : 0
  }
}
