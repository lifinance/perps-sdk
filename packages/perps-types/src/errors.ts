import type { PerpsErrorCode } from './enums.js'

/**
 * Structured perps API error payload. `code` is the stable classification;
 * `tool` identifies the backend tool when the provider supplies one.
 *
 * @public
 */
export interface PerpsErrorBody {
  code: PerpsErrorCode
  tool?: string
  message: string
}
