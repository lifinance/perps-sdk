import type { AccountConfig } from '@lifi/perps-types'
import { ChainId } from '@lifi/types'

/** Perps provider keys that have a declared LI.FI deposit-target chain. */
export type DepositProviderKey = AccountConfig['provider']

/**
 * Declared single source of truth: perps provider key → the LI.FI chain a
 * client opens the swap widget against to fund that provider. Values come from
 * the `@lifi/types` `ChainId` enum; never hardcode the numeric ids.
 */
export const LIFI_DEPOSIT_CHAIN_BY_PROVIDER: Record<
  DepositProviderKey,
  ChainId
> = {
  hyperliquid: ChainId.HPL,
  lighter: ChainId.LTR,
}

/**
 * Resolve the LI.FI deposit-target chain for a perps provider key.
 *
 * @returns The `@lifi/types` `ChainId`, or `undefined` for a provider key with
 *   no declared deposit chain (the `/providers` wire key is an open `string`).
 */
export function lifiDepositChainForProvider(
  providerKey: string
): ChainId | undefined {
  return LIFI_DEPOSIT_CHAIN_BY_PROVIDER[providerKey as DepositProviderKey]
}
