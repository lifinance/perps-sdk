import {
  type DeclaredDepositAsset,
  type DepositFlow,
  ETHEREUM_NATIVE_GAS,
  ETHEREUM_USDC,
  LIGHTER_USDC,
  ROBINHOOD_NATIVE_GAS,
  ROBINHOOD_USDG,
} from '@lifi/perps-sdk'
import { ActionType, type LighterProviderKey } from '@lifi/perps-types'
import { LIGHTER_PROVIDER_KEY, LIGHTER_RH_PROVIDER_KEY } from './constants.js'

interface LighterDepositAssets {
  /**
   * Collateral token on the venue chain that a LI.FI route credits to an
   * account that exists. Absent when only the venue deposit credits an account.
   */
  venueCollateral?: DeclaredDepositAsset
  /** Collateral the venue deposit is made in, on the chain that deposit runs on. */
  venueDepositCollateral: DeclaredDepositAsset
  venueDepositGas: DeclaredDepositAsset
}

const DEPOSIT_ASSETS: Record<LighterProviderKey, LighterDepositAssets> = {
  [LIGHTER_PROVIDER_KEY]: {
    venueCollateral: LIGHTER_USDC,
    venueDepositCollateral: ETHEREUM_USDC,
    venueDepositGas: ETHEREUM_NATIVE_GAS,
  },
  [LIGHTER_RH_PROVIDER_KEY]: {
    venueDepositCollateral: ROBINHOOD_USDG,
    venueDepositGas: ROBINHOOD_NATIVE_GAS,
  },
}

/**
 * Resolve one Lighter instance's deposit flow from whether the account already
 * exists: an existing account takes a swap into the instance's venue collateral
 * when a LI.FI route credits it there. Every other case runs the venue deposit
 * on the chain that instance's collateral is deposited from.
 *
 * @public
 */
export function lighterDepositFlow(
  providerKey: LighterProviderKey,
  accountExists: boolean
): DepositFlow {
  const assets = DEPOSIT_ASSETS[providerKey]

  if (accountExists && assets.venueCollateral) {
    return { kind: 'lifiSwap', destination: assets.venueCollateral }
  }

  return {
    kind: 'venueDepositPipeline',
    chainId: assets.venueDepositCollateral.chainId,
    gasAsset: assets.venueDepositGas,
    collateral: assets.venueDepositCollateral,
    bridgeAction: ActionType.DEPOSIT,
  }
}
