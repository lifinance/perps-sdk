import type { ActionType } from './enums.js'
import type { Address } from './primitives.js'

/** The execution boundary used to fund a provider account. */
export enum DepositMethodKind {
  PROVIDER_BRIDGE = 'providerBridge',
  LIFI_ROUTE = 'lifiRoute',
  RAW_TRANSFER = 'rawTransfer',
}

/** Account state for which a deposit method is valid. */
export type DepositAccountState = 'missing' | 'existing' | 'any'

/** A chain/token pair selected by the wallet for a deposit. */
export interface DepositAsset {
  chainId: number
  address: Address
  symbol?: string
  decimals?: number
}

/** A wallet prerequisite the consumer can evaluate against live balances. */
export interface DepositPrerequisite {
  asset: DepositAsset
  kind: 'funding' | 'gas' | 'refuel'
  optional?: boolean
}

/** An internal provider action leg, not a separate setup checklist item. */
export interface DepositActionLeg {
  action: ActionType
  title?: string
}

/** Provider action linkage for a method that is executed through the SDK. */
export interface DepositProviderAction {
  action: ActionType
  legs: DepositActionLeg[]
}

/**
 * Provider-owned description of one valid way to fund an account. The SDK does
 * not inspect wallet balances; consumers decide which method is currently
 * eligible and whether it should be recommended.
 */
export interface DepositMethod {
  kind: DepositMethodKind
  accountState: DepositAccountState
  sourceAsset: DepositAsset
  destinationAsset?: DepositAsset
  recipient?: Address
  providerAction?: DepositProviderAction
  prerequisites?: DepositPrerequisite[]
}

/** Input used by provider plugins to resolve deposit methods. */
export interface GetDepositMethodsParams {
  address: Address
  sourceAsset: DepositAsset
}
