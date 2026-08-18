import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from './PerpsError.js'

describe('PerpsError', () => {
  it('should have code and message', () => {
    const error = new PerpsError(PerpsErrorCode.ValidationError, 'Bad input')

    expect(error.name).toBe('PerpsError')
    expect(error.code).toBe(PerpsErrorCode.ValidationError)
    expect(error.message).toBe('Bad input')
  })

  it('should have default code and message', () => {
    const error = new PerpsError()

    expect(error.code).toBe(PerpsErrorCode.DefaultError)
    expect(error.message).toBe('Unknown error occurred')
  })

  it('should support tool property', () => {
    const error = new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      'DEX rejected order'
    )
    error.tool = 'hyperliquid'

    expect(error.tool).toBe('hyperliquid')
  })

  it('should be instanceof Error', () => {
    const error = new PerpsError()

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(PerpsError)
  })

  it('SDK-local errors use tool @lifi/perps-sdk', () => {
    const error = new PerpsError(
      PerpsErrorCode.SDKError,
      "Provider plugin not registered: 'hyperliquid'."
    )
    error.tool = '@lifi/perps-sdk'

    expect(error.tool).toBe('@lifi/perps-sdk')
    expect(error.code).toBe(PerpsErrorCode.SDKError)
  })
})
