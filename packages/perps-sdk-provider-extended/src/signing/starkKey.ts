import type { Hex } from '@lifi/perps-types'
import { getStarkKey, grindKey, sign } from '@scure/starknet'
import { toStarkHex } from './starkFelt.js'

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
export function calculateStarkPrivateKey(walletSignature: string): Hex {
  const signatureHex = walletSignature.replace(/^0x/, '')
  // Extended reads r as an integer, so leading zero bytes do not enter the
  // seed. `ethSigToPrivate` keeps them and gives a different key.
  const r = BigInt(`0x${signatureHex.slice(0, 64)}`).toString(16)
  return toStarkHex(`0x${grindKey(r.length % 2 === 0 ? r : `0${r}`)}`)
}

/** Calculate the Stark public key (the x coordinate) of a private key. @public */
export function calculateStarkPublicKey(privateKey: Hex): Hex {
  return toStarkHex(getStarkKey(privateKey))
}

/** Sign a Stark message hash. The signature is deterministic (RFC 6979). @public */
export function signStarkHash(hash: Hex, privateKey: Hex): StarkSignature {
  const signature = sign(hash, privateKey)
  return { r: toStarkHex(signature.r), s: toStarkHex(signature.s) }
}
