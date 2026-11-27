import type { StarkMessage } from '@lifi/perps-types'

// Type aliases rather than interfaces, so each shape is assignable to the
// `Record<string, string>` fields of a `StarkMessage`.

/**
 * Settlement fields of an Extended order. Each value is an integer as a
 * decimal or `0x` hex string. Amounts are signed: the side that the account
 * pays is negative.
 *
 * @public
 */
export type ExtendedStarkOrderFields = {
  positionId: string
  baseAssetId: string
  baseAmount: string
  quoteAssetId: string
  quoteAmount: string
  feeAssetId: string
  feeAmount: string
  /** Unix time in seconds. */
  expiration: string
  salt: string
}

/**
 * Settlement fields of an Extended transfer between two positions. Each value
 * is an integer as a decimal or `0x` hex string.
 *
 * @public
 */
export type ExtendedStarkTransferFields = {
  recipientPositionId: string
  senderPositionId: string
  collateralId: string
  amount: string
  /** Unix time in seconds. */
  expiration: string
  salt: string
}

/**
 * Settlement fields of an Extended withdrawal. Each value is an integer as a
 * decimal or `0x` hex string.
 *
 * @public
 */
export type ExtendedStarkWithdrawalFields = {
  /** Starknet contract address that receives the withdrawal. */
  recipient: string
  positionId: string
  collateralId: string
  amount: string
  /** Unix time in seconds. */
  expiration: string
  salt: string
}

/**
 * The `StarkMessage` shapes that Extended signs. The backend builds them and
 * the provider signs them.
 *
 * @public
 */
export type ExtendedStarkMessage = Pick<StarkMessage, 'signaturePath'> &
  (
    | { type: 'order'; fields: ExtendedStarkOrderFields }
    | { type: 'transfer'; fields: ExtendedStarkTransferFields }
    | { type: 'withdrawal'; fields: ExtendedStarkWithdrawalFields }
  )
