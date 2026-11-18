import type { Hex } from '@lifi/perps-types'
import { getStarkKey } from '@scure/starknet'
import { toStarkHex } from './starkFelt.js'
import { loadStarkWasm } from './starkWasm.js'

/** Stark ECDSA signature, each part as an unpadded `0x` hex string. @public */
export interface StarkSignature {
  r: Hex
  s: Hex
}

/**
 * Calculate the Stark private key from the wallet signature over Extended's
 * `AccountCreation` typed data. Signing the same typed data again gives the
 * same key, so the wallet can always recover it.
 *
 * @public
 */
export async function calculateStarkPrivateKey(
  walletSignature: string
): Promise<Hex> {
  const wasm = await loadStarkWasm()
  return toStarkHex(
    wasm.generate_private_key_from_eth_signature(walletSignature)
  )
}

/** Calculate the Stark public key (the x coordinate) of a private key. @public */
export function calculateStarkPublicKey(privateKey: Hex): Hex {
  return toStarkHex(getStarkKey(privateKey))
}

/** Sign a Stark message hash. The signature is deterministic (RFC 6979). @public */
export async function signStarkHash(
  hash: Hex,
  privateKey: Hex
): Promise<StarkSignature> {
  const wasm = await loadStarkWasm()
  const signature = wasm.sign_message(privateKey, hash)
  try {
    return { r: toStarkHex(signature.r), s: toStarkHex(signature.s) }
  } finally {
    signature.free()
  }
}
