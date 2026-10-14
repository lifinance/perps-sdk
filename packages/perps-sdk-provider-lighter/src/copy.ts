import type { ActionType } from '@lifi/perps-types'
import { CHECK_ACCOUNT_BEFORE_RETRY_TEXT } from '@lifi/perps-types'

export const unconfirmedIndeterminateErrorText = (
  action: ActionType,
  providerKey: string
): string =>
  `${action} was submitted to ${providerKey} but we could not confirm it was accepted. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`

export const rejectedFailedErrorText = (
  action: ActionType,
  providerKey: string,
  code: number | undefined,
  httpStatus: number,
  venueMessage: string | undefined
): string =>
  `${providerKey} ${action} rejected (code ${code ?? httpStatus})${venueMessage ? `: ${venueMessage}` : ''}`

export const revertedFailedErrorText = (
  action: ActionType,
  txHash: string
): string =>
  `EVM_TX leg '${action}' reverted (tx ${txHash}); aborted the remaining legs.`
