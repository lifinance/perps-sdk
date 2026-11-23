import type { ActionResult, SignedActionStep } from '@lifi/perps-types'
import { UserActionStatus } from '@lifi/perps-types'

/** Whether the action took effect: its status is `Submitted` or `Accepted`. */
export function isSubmittedOrAccepted(result: ActionResult): boolean {
  return (
    result.status === UserActionStatus.Submitted ||
    result.status === UserActionStatus.Accepted
  )
}

/**
 * `Submitted` results for the signed steps that took effect before
 * `/executeAction`: an EVM transaction the wallet broadcast, or a Stark
 * request the client sent itself. Other steps take effect only through
 * `/executeAction`, so they give no result.
 */
export function sentBeforeExecuteResults(
  signed: SignedActionStep[]
): ActionResult[] {
  return signed.flatMap((step): ActionResult[] => {
    if ('txHash' in step) {
      return [
        {
          action: step.action,
          status: UserActionStatus.Submitted,
          txHash: step.txHash,
        },
      ]
    }
    if ('stark' in step && step.clientSent !== undefined) {
      const { orderId } = step.clientSent
      return [
        {
          action: step.action,
          status: UserActionStatus.Submitted,
          ...(orderId === undefined ? {} : { orderId }),
        },
      ]
    }
    return []
  })
}
