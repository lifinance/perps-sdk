import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
  DEFAULT_LIGHTER_REST_URL,
  DEFAULT_LIGHTER_WS_URL,
  LIGHTER_MAINNET_DEPLOYMENT,
  LIGHTER_MAINNET_SIGNER_CHAIN_ID,
  LIGHTER_PROVIDER_KEY,
  LIGHTER_RH_DEPLOYMENT,
  LIGHTER_RH_PROVIDER_KEY,
  LIGHTER_RH_REST_URL,
  LIGHTER_RH_SIGNER_CHAIN_ID,
  LIGHTER_RH_WS_URL,
} from './constants.js'

/** Robinhood's L1 chain id — a decoy for the zkLighter L2 signing chain id. */
const ROBINHOOD_L1_CHAIN_ID = 4663

describe('Lighter deployment descriptors', () => {
  it('encodes the RH zkLighter signing chain id from lighter-python v1.1.2', () => {
    expect(LIGHTER_RH_SIGNER_CHAIN_ID).toBe(466324)
  })

  it('never signs RH with mainnet 304 or the Robinhood L1 chain id', () => {
    expect(LIGHTER_RH_DEPLOYMENT.signerChainId).toBe(LIGHTER_RH_SIGNER_CHAIN_ID)
    expect(LIGHTER_RH_DEPLOYMENT.signerChainId).not.toBe(
      LIGHTER_MAINNET_SIGNER_CHAIN_ID
    )
    expect(LIGHTER_RH_DEPLOYMENT.signerChainId).not.toBe(ROBINHOOD_L1_CHAIN_ID)
  })

  it('carries the mainnet deployment facts', () => {
    expect(LIGHTER_MAINNET_DEPLOYMENT).toEqual({
      providerKey: LIGHTER_PROVIDER_KEY,
      restUrl: DEFAULT_LIGHTER_REST_URL,
      wsUrl: DEFAULT_LIGHTER_WS_URL,
      signerChainId: 304,
      collateral: { assetIndex: 3, displaySymbol: 'USDC' },
      explorerTxBaseUrl: DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
    })
    expect(LIGHTER_MAINNET_SIGNER_CHAIN_ID).toBe(304)
  })

  it('carries the RH deployment facts with no explorer until confirmed', () => {
    expect(LIGHTER_RH_DEPLOYMENT).toEqual({
      providerKey: LIGHTER_RH_PROVIDER_KEY,
      restUrl: LIGHTER_RH_REST_URL,
      wsUrl: LIGHTER_RH_WS_URL,
      signerChainId: 466324,
      // USDG sits at the RH registry's slot 3 — the slot mainnet holds USDC in.
      collateral: { assetIndex: 3, displaySymbol: 'USDG' },
      explorerTxBaseUrl: undefined,
    })
    expect(LIGHTER_RH_REST_URL).toBe('https://api.rh.lighter.xyz')
    expect(LIGHTER_RH_WS_URL).toBe('wss://api.rh.lighter.xyz/stream')
  })

  it('shares no endpoint, chain id or collateral between deployments', () => {
    expect(LIGHTER_RH_DEPLOYMENT.restUrl).not.toBe(
      LIGHTER_MAINNET_DEPLOYMENT.restUrl
    )
    expect(LIGHTER_RH_DEPLOYMENT.wsUrl).not.toBe(
      LIGHTER_MAINNET_DEPLOYMENT.wsUrl
    )
    expect(LIGHTER_RH_DEPLOYMENT.providerKey).not.toBe(
      LIGHTER_MAINNET_DEPLOYMENT.providerKey
    )
    expect(LIGHTER_RH_DEPLOYMENT.collateral).not.toBe(
      LIGHTER_MAINNET_DEPLOYMENT.collateral
    )
    expect(LIGHTER_RH_DEPLOYMENT.collateral.displaySymbol).not.toBe(
      LIGHTER_MAINNET_DEPLOYMENT.collateral.displaySymbol
    )
  })

  it.each([
    ['mainnet', LIGHTER_MAINNET_DEPLOYMENT],
    ['rh', LIGHTER_RH_DEPLOYMENT],
  ])('freezes the %s descriptor and its collateral', (_name, deployment) => {
    expect(Object.isFrozen(deployment)).toBe(true)
    expect(Object.isFrozen(deployment.collateral)).toBe(true)
    expect(Reflect.set(deployment, 'signerChainId', 1)).toBe(false)
    expect(Reflect.set(deployment.collateral, 'assetIndex', 99)).toBe(false)
    expect(deployment.signerChainId).not.toBe(1)
    expect(deployment.collateral.assetIndex).toBe(3)
  })
})
