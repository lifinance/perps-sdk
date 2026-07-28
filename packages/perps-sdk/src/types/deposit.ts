import type { ActionType } from '@lifi/perps-types'
import type { Address } from 'viem'

/**
 * A token the SDK declares as part of a deposit flow, by full on-chain
 * identity. Matched by `chainId` + `address`: a symbol is not identity — the
 * Hyperliquid venue chain lists two `USDC` contracts with different decimals.
 *
 * @public
 */
export interface DeclaredDepositAsset {
  /** EVM chain id on which the asset is held or broadcast. */
  chainId: number
  /** EIP-55 checksummed address; the zero address denotes native gas. */
  address: Address
  /** Decimal places used by the token; native gas assets use 18. */
  decimals: number
}

/**
 * Fund the account by swapping whatever the user holds into `destination`
 * through the LI.FI surface. The source token is picked inside that surface, so
 * it is not part of the flow; LI.FI routing owns whether that resolves to a
 * same-chain swap or a bridge.
 *
 * @public
 */
export interface DepositFlowLifiSwap {
  kind: 'lifiSwap'
  /** Destination collateral token and its full chain identity. */
  destination: DeclaredDepositAsset
  /**
   * Credited address when it is not the user's own — a venue-provisioned
   * deposit address. Absent means the user's address receives the deposit.
   */
  toAddress?: Address
}

/**
 * Fund an address that has no venue account yet. Collateral and the native gas
 * to broadcast with are both needed on `chainId`, where the venue's
 * {@link ActionType.DEPOSIT} action stages the on-chain legs that open the
 * account.
 *
 * @public
 */
export interface DepositFlowFirstDepositPipeline {
  kind: 'firstDepositPipeline'
  /** Chain on which the deposit legs broadcast; the wallet must be switched here. */
  chainId: number
  /** Native gas asset needed to broadcast the deposit legs. */
  gasAsset: DeclaredDepositAsset
  /** Collateral asset credited by the first deposit. */
  collateral: DeclaredDepositAsset
  /** Action type used to stage the deposit pipeline. */
  bridgeAction: ActionType.DEPOSIT
}

/**
 * The venue cannot name a deposit destination until the listed setup actions
 * are satisfied — Ondo provisions its deposit address behind a signed-in
 * session.
 *
 * @public
 */
export interface DepositFlowSetupRequired {
  kind: 'setupRequired'
  /** Setup action types that must be completed, in execution order. */
  setup: ActionType[]
}

/**
 * The single deposit flow a venue offers one address, resolved from the venue's
 * account and setup state.
 *
 * @public
 */
export type DepositFlow =
  | DepositFlowLifiSwap
  | DepositFlowFirstDepositPipeline
  | DepositFlowSetupRequired
