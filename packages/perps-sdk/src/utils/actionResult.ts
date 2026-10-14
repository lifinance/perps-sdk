import type { ActionResult } from '@lifi/perps-types'
import { UserActionStatus } from '@lifi/perps-types'

/** Whether the action took effect: its status is `Submitted` or `Accepted`. */
export function isSubmittedOrAccepted(result: ActionResult): boolean {
  return (
    result.status === UserActionStatus.Submitted ||
    result.status === UserActionStatus.Accepted
  )
}
