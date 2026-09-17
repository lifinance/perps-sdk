/**
 * One HyperCore transaction as the explorer `userDetails` RPC reports it.
 *
 * @public
 */
export interface HlExplorerTx {
  time: number
  user: string
  /**
   * The action body HyperCore received. Untyped because the shape varies by
   * action type; read it through `getClientOrderIds`, not by field name.
   */
  action: unknown
  block: number
  hash: string
  /** `null` on a tx the engine applied, a message on one it landed but refused. */
  error: string | null
}

/**
 * Whether one `userDetails` entry carries every field this package reads. The
 * explorer RPC is undocumented, so entries are checked one at a time and a
 * drifted entry drops on its own instead of failing the whole window.
 *
 * @public
 */
export const isHlExplorerTx = (value: unknown): value is HlExplorerTx =>
  typeof value === 'object' &&
  value !== null &&
  'time' in value &&
  typeof value.time === 'number' &&
  'user' in value &&
  typeof value.user === 'string' &&
  'block' in value &&
  typeof value.block === 'number' &&
  'hash' in value &&
  typeof value.hash === 'string' &&
  'error' in value &&
  (value.error === null || typeof value.error === 'string')
