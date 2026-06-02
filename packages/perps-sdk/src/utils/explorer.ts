/**
 * Block-explorer URL resolution.
 *
 * Provider plugins resolve a tx hash to a fully-qualified explorer URL during
 * wire→domain mapping. The explorer target is a function of the settling chain,
 * so the map is keyed by chain id rather than by provider.
 */

/**
 * Settling chains a perps tx can be observed on.
 *
 * @public
 */
export const ExplorerChainId = {
  ETHEREUM: 1,
  ARBITRUM_ONE: 42161,
  LIGHTER: 304,
} as const

/**
 * Union of {@link ExplorerChainId} values.
 *
 * @public
 */
export type ExplorerChainId =
  (typeof ExplorerChainId)[keyof typeof ExplorerChainId]

const TX_BASE_URL_BY_CHAIN: Record<ExplorerChainId, string> = {
  [ExplorerChainId.ETHEREUM]: 'https://etherscan.io/tx/',
  [ExplorerChainId.ARBITRUM_ONE]: 'https://arbiscan.io/tx/',
  [ExplorerChainId.LIGHTER]: 'https://scan.lighter.xyz/tx/',
}

/**
 * Build a fully-resolved block-explorer URL for a tx on a known chain.
 *
 * @returns The explorer URL, or `undefined` when the hash is empty (no on-chain
 *   tx to link).
 * @public
 */
export function explorerTxUrl(
  chainId: ExplorerChainId,
  txHash: string | undefined
): string | undefined {
  if (!txHash) {
    return undefined
  }
  return `${TX_BASE_URL_BY_CHAIN[chainId]}${txHash}`
}
