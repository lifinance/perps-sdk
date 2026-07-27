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
  /** Collateral token on the venue chain, credited to an account that exists. */
  venueCollateral: DeclaredDepositAsset
  /** Collateral the account-opening deposit is made in, on the chain that deposit runs on. */
  firstDepositCollateral: DeclaredDepositAsset
  firstDepositGas: DeclaredDepositAsset
}

const DEPOSIT_ASSETS: Record<LighterProviderKey, LighterDepositAssets> = {
  [LIGHTER_PROVIDER_KEY]: {
    venueCollateral: LIGHTER_USDC,
    firstDepositCollateral: ETHEREUM_USDC,
    firstDepositGas: ETHEREUM_NATIVE_GAS,
  },
  [LIGHTER_RH_PROVIDER_KEY]: {
    venueCollateral: ROBINHOOD_USDG,
    firstDepositCollateral: ROBINHOOD_USDG,
    firstDepositGas: ROBINHOOD_NATIVE_GAS,
  },
}

/**
 * Resolve one Lighter instance's deposit flow from whether the account already
 * exists: an existing account takes a swap into the instance's venue collateral,
 * while an address with no account runs the account-opening deposit on the chain
 * that instance's collateral is deposited from.
 *
 * @public
 */
export function lighterDepositFlow(
  providerKey: LighterProviderKey,
  accountExists: boolean
): DepositFlow {
  const assets = DEPOSIT_ASSETS[providerKey]

  if (accountExists) {
    return { kind: 'lifiSwap', destination: assets.venueCollateral }
  }

  return {
    kind: 'firstDepositPipeline',
    chainId: assets.firstDepositCollateral.chainId,
    gasAsset: assets.firstDepositGas,
    collateral: assets.firstDepositCollateral,
    bridgeAction: ActionType.DEPOSIT,
  }
}
