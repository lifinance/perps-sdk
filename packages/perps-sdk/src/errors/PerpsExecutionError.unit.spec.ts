import {
  type ActionResult,
  ActionType,
  PerpsErrorCode,
  UserActionStatus,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { PerpsError } from './PerpsError.js'
import {
  PerpsExecutionError,
  rethrowWithKnownResults,
} from './PerpsExecutionError.js'

const result = (orderId: string): ActionResult => ({
  action: ActionType.PLACE_ORDER,
  status: UserActionStatus.Submitted,
  orderId,
})

function captureRethrow(known: ActionResult[], cause: unknown): unknown {
  try {
    rethrowWithKnownResults(known, cause)
  } catch (error) {
    return error
  }
}

describe('PerpsExecutionError', () => {
  it('preserves provider attribution, code, message and cause', () => {
    const cause = new PerpsError(
      PerpsErrorCode.ThirdPartyError,
      'venue unavailable'
    )
    cause.tool = 'lighter'
    const error = new PerpsExecutionError({ results: [result('1')] }, cause)

    expect(error.tool).toBe('lighter')
    expect(error.code).toBe(cause.code)
    expect(error.message).toBe(cause.message)
    expect(error.cause).toBe(cause)
  })

  it('prepends nested known reports in execution order and keeps the original cause', () => {
    const cause = new PerpsError(
      PerpsErrorCode.TimeoutError,
      'no acknowledgement'
    )
    cause.tool = 'hyperliquid'
    const inner = captureRethrow([result('3')], cause)
    const middle = captureRethrow([result('2')], inner)
    const outer = captureRethrow([result('1')], middle)

    expect(outer).toBeInstanceOf(PerpsExecutionError)
    expect(outer).toMatchObject({
      response: { results: [result('1'), result('2'), result('3')] },
      code: cause.code,
      message: cause.message,
      tool: cause.tool,
    })
    if (!(outer instanceof PerpsExecutionError)) {
      throw new Error('Expected execution error')
    }
    expect(outer.cause).toBe(cause)
  })

  it('keeps the error identity when no additional result is known', () => {
    const cause = new PerpsError(
      PerpsErrorCode.SignatureInvalid,
      'wallet refused'
    )
    const wrapped = new PerpsExecutionError({ results: [result('1')] }, cause)
    expect(captureRethrow([], cause)).toBe(cause)
    expect(captureRethrow([], wrapped)).toBe(wrapped)
  })
})
