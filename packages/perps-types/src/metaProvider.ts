/**
 * Sentinel sent in the `provider` field for provider-independent actions
 * (e.g. {@link "./enums.js".ActionType.META_ACCEPT_TERMS}). The backend
 * dispatches on this value instead of resolving a real provider plugin.
 * @public
 */
export const META_PROVIDER = 'meta'

/** Type alias for the {@link META_PROVIDER} provider-independent sentinel. @public */
export type MetaProvider = typeof META_PROVIDER
