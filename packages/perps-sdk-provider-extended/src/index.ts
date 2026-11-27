// biome-ignore-all lint/performance/noBarrelFile: package public entry point.

/**
 * Extended provider plugin for `@lifi/perps-sdk`. Extended settles on
 * Starknet: the account signs orders, transfers, and withdrawals with a Stark
 * key that the user's wallet signature generates in the client.
 *
 * @packageDocumentation
 * @public
 */

export {
  calculateStarkPrivateKey,
  calculateStarkPublicKey,
  type StarkSignature,
  signStarkHash,
} from './signing/starkKey.js'
export {
  calculateStarkOrderHash,
  calculateStarkRegistrationHash,
  calculateStarkTransferHash,
  calculateStarkWithdrawalHash,
  EXTENDED_MAINNET_STARK_DOMAIN,
  type StarkDomain,
} from './signing/starkMessageHash.js'
export type {
  ExtendedStarkMessage,
  ExtendedStarkOrderFields,
  ExtendedStarkTransferFields,
  ExtendedStarkWithdrawalFields,
} from './types/starkMessage.js'
