import type { ActionResult } from '@lifi/perps-types'
import { ActionType, UserActionStatus } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { isSubmittedOrAccepted } from './actionResult.js'

describe('isSubmittedOrAccepted', () => {
  it.each<[ActionResult['status'], boolean]>([
    [UserActionStatus.Submitted, true],
    [UserActionStatus.Accepted, true],
    [UserActionStatus.Indeterminate, false],
    [UserActionStatus.Failed, false],
  ])('returns the verdict for %s', (status, expected) => {
    expect(
      isSubmittedOrAccepted({ action: ActionType.PLACE_ORDER, status })
    ).toBe(expected)
  })
})
