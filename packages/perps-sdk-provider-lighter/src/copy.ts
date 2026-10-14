import type { ActionType } from '@lifi/perps-types'
import { CHECK_ACCOUNT_BEFORE_RETRY_TEXT } from '@lifi/perps-types'

export const noAnswerIndeterminateErrorText = (
  action: ActionType,
  reason: string
): string =>
  `Lighter ${action} got no answer: ${reason}. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`

export const noVerdictIndeterminateErrorText = (
  action: ActionType,
  httpStatus: number
): string =>
  `Lighter ${action} returned no reliable verdict (HTTP ${httpStatus}). ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`

export const noReceiptIndeterminateErrorText = (
  action: ActionType,
  txHash: string,
  reason: string
): string =>
  `EVM_TX leg '${action}' (tx ${txHash}) has no receipt: ${reason}. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`

export const rejectedFailedErrorText = (
  action: ActionType,
  code: number | undefined,
  httpStatus: number,
  venueMessage: string | undefined
): string =>
  `Lighter ${action} rejected (code ${code ?? httpStatus})${venueMessage ? `: ${venueMessage}` : ''}`

export const revertedFailedErrorText = (
  action: ActionType,
  txHash: string
): string =>
  `EVM_TX leg '${action}' reverted (tx ${txHash}); aborted the remaining legs.`
