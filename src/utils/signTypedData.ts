import { privateKeyToAccount } from 'viem/accounts'
import type { Hex, PerpsTypedData } from '../types/perps.js'

/**
 * Sign EIP-712 typed data with a private key.
 *
 * @param privateKey - The private key to sign with
 * @param typedData - The typed data to sign
 * @returns The signature as a hex string
 *
 * @example
 * ```ts
 * const signature = await signTypedData(agentPrivateKey, typedData)
 * ```
 */
export async function signTypedData(
  privateKey: Hex,
  typedData: PerpsTypedData
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)

  // viem's signTypedData expects the typed data in a specific format
  const signature = await account.signTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })

  return signature
}
