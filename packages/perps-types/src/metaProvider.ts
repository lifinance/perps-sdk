import type { ActionType } from './enums.js'

/**
 * Sentinel sent in the `provider` field for provider-independent actions
 * (e.g. {@link "./enums.js".ActionType.META_ACCEPT_TERMS}). The backend
 * dispatches on this value instead of resolving a real provider plugin.
 * @public
 */
export const META_PROVIDER = 'meta'

/** Type alias for the {@link META_PROVIDER} provider-independent sentinel. @public */
export type MetaProvider = typeof META_PROVIDER

/**
 * The provider-independent actions dispatched with the {@link META_PROVIDER}
 * sentinel. They carry no venue plugin and no `ProviderAction` descriptor, so
 * they are signed as EIP-712 typed data with the end-user's wallet.
 * @public
 */
export type MetaActionType =
  | ActionType.META_ACCEPT_TERMS
  | ActionType.META_ONBOARD
  | ActionType.META_CREATE_REFERRAL_CODE
