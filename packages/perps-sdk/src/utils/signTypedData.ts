import type { PerpsTypedData } from '@lifi/perps-types'
import type { Account, Hex, WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Sign EIP-712 typed data with a raw private key (agent keypair).
 *
 * @public
 */
export async function signTypedData(
  privateKey: Hex,
  typedData: PerpsTypedData
): Promise<Hex> {
  return privateKeyToAccount(privateKey).signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
}

/**
 * Sign EIP-712 typed data with an externally-provided WalletClient. Works
 * with browser wallets (wagmi), private keys, mnemonics — any viem
 * WalletClient.
 *
 * @internal
 */
export async function signTypedDataWithSigner(
  signer: WalletClient<any, any, Account>,
  typedData: PerpsTypedData
): Promise<Hex> {
  return signer.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
}
