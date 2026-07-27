import { ChainId } from '@lifi/types'
import { zeroAddress } from 'viem'
import type { DeclaredDepositAsset } from '../types/deposit.js'

/**
 * USDC on Ethereum mainnet — the collateral leg of Lighter's first-deposit
 * pipeline, and the token Ondo's provisioned deposit address is funded in.
 *
 * @public
 */
export const ETHEREUM_USDC: DeclaredDepositAsset = {
  chainId: ChainId.ETH,
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
}

/**
 * Ether on Ethereum mainnet, to broadcast the first-deposit pipeline's legs
 * with.
 *
 * @public
 */
export const ETHEREUM_NATIVE_GAS: DeclaredDepositAsset = {
  chainId: ChainId.ETH,
  address: zeroAddress,
  decimals: 18,
}

/**
 * USDC on the Hyperliquid venue chain: the 6-decimal perps contract. The same
 * chain also lists an 8-decimal spot `USDC` at
 * `0x6d1e7cde53bA9467B783Cb7c530CE05400000000`, so a deposit destination
 * resolved by symbol lands on the wrong token and the wrong scale.
 *
 * @public
 */
export const HYPERLIQUID_USDC: DeclaredDepositAsset = {
  chainId: ChainId.HPL,
  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  decimals: 6,
}

/**
 * USDC on the Lighter venue chain. The venue chain reuses the mainnet USDC
 * address, so `chainId` is what distinguishes it from {@link ETHEREUM_USDC}.
 *
 * @public
 */
export const LIGHTER_USDC: DeclaredDepositAsset = {
  chainId: ChainId.LTR,
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  decimals: 6,
}

/**
 * USDG on Robinhood Chain — the collateral the Lighter Robinhood instance is
 * funded in.
 *
 * @public
 */
export const ROBINHOOD_USDG: DeclaredDepositAsset = {
  chainId: ChainId.OUT,
  address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  decimals: 6,
}

/**
 * Ether on Robinhood Chain, to broadcast the Robinhood first-deposit pipeline's
 * legs with.
 *
 * @public
 */
export const ROBINHOOD_NATIVE_GAS: DeclaredDepositAsset = {
  chainId: ChainId.OUT,
  address: zeroAddress,
  decimals: 18,
}
