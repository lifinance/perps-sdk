import type { PerpsErrorCode } from './enums.js'

/** @public */
export interface PerpsErrorBody {
  code: PerpsErrorCode
  tool?: string
  message: string
}
