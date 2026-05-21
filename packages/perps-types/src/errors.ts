import type { PerpsErrorCode } from './enums.js'

export interface PerpsErrorBody {
  code: PerpsErrorCode
  tool?: string
  message: string
}
