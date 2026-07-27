import {
  ETHEREUM_NATIVE_GAS,
  ETHEREUM_USDC,
  LIGHTER_USDC,
  ROBINHOOD_NATIVE_GAS,
  ROBINHOOD_USDG,
} from '@lifi/perps-sdk'
import { ActionType } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { LIGHTER_PROVIDER_KEY, LIGHTER_RH_PROVIDER_KEY } from './constants.js'
import { lighterDepositFlow } from './depositFlow.js'

describe('lighterDepositFlow', () => {
  it('swaps into venue USDC when the mainnet account exists', () => {
    expect(lighterDepositFlow(LIGHTER_PROVIDER_KEY, true)).toEqual({
      kind: 'lifiSwap',
      destination: LIGHTER_USDC,
    })
  })

  it('opens a mainnet account with an Ethereum USDC pipeline', () => {
    expect(lighterDepositFlow(LIGHTER_PROVIDER_KEY, false)).toEqual({
      kind: 'firstDepositPipeline',
      chainId: ETHEREUM_USDC.chainId,
      gasAsset: ETHEREUM_NATIVE_GAS,
      collateral: ETHEREUM_USDC,
      bridgeAction: ActionType.DEPOSIT,
    })
  })

  it('swaps into USDG when the Robinhood account exists', () => {
    expect(lighterDepositFlow(LIGHTER_RH_PROVIDER_KEY, true)).toEqual({
      kind: 'lifiSwap',
      destination: ROBINHOOD_USDG,
    })
  })

  it('opens a Robinhood account with a USDG pipeline on its own chain', () => {
    expect(lighterDepositFlow(LIGHTER_RH_PROVIDER_KEY, false)).toEqual({
      kind: 'firstDepositPipeline',
      chainId: ROBINHOOD_USDG.chainId,
      gasAsset: ROBINHOOD_NATIVE_GAS,
      collateral: ROBINHOOD_USDG,
      bridgeAction: ActionType.DEPOSIT,
    })
  })
})
