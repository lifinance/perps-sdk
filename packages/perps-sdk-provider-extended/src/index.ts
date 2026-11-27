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
  ExtendedCredentialStore,
  type ExtendedCredentials,
} from './auth/ExtendedCredentialStore.js'
export { extendedSignActions } from './auth/signActions.js'
export {
  DEFAULT_EXTENDED_API_URL,
  DEFAULT_EXTENDED_WS_URL,
  EXTENDED_BASE_FEE_TIER,
  EXTENDED_DEPOSIT_CHAIN_ID,
  EXTENDED_DEPOSIT_COLLATERAL,
  EXTENDED_DEPOSIT_GAS,
  EXTENDED_PROVIDER_KEY,
} from './constants.js'
export {
  Extended,
  type ExtendedProviderOptions,
  extendedProvider,
} from './ExtendedProvider.js'
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
export type * from './types/wire.js'
export { ExtendedApiClient, ExtendedApiError } from './utils/apiClient.js'
export {
  ExtendedWsProvider,
  type ExtendedWsProviderOptions,
  extendedWsProvider,
} from './websocket/ExtendedWsProvider.js'
