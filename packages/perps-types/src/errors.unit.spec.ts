import { describe, expect, it } from 'vitest'
import { PerpsErrorCode } from './enums.js'
import type { PerpsErrorBody } from './errors.js'

describe('PerpsErrorBody', () => {
  it('accepts SetupRequired on the existing `code` field', () => {
    const body: PerpsErrorBody = {
      code: PerpsErrorCode.SetupRequired,
      tool: 'perps',
      message: 'Complete the provider setup before trading.',
    }

    expect(body.code).toBe(PerpsErrorCode.SetupRequired)
  })

  it('carries no setup payload beyond the classification code', () => {
    const body: PerpsErrorBody = {
      code: PerpsErrorCode.SetupRequired,
      message: 'Complete the provider setup before trading.',
      // @ts-expect-error — setup details are not part of the error body
      setupSteps: ['registerApiKey'],
    }

    expect(body.code).toBe(PerpsErrorCode.SetupRequired)
  })
})
