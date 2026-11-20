/** Provider key of Extended in the LI.FI backend's `/providers` response. @public */
export const EXTENDED_PROVIDER_KEY = 'extended'

/** Extended mainnet host. Account routes live under `/api/v1`, onboarding under `/auth`. @public */
export const DEFAULT_EXTENDED_API_URL = 'https://api.starknet.extended.exchange'

/** EIP-712 domain name of the Extended onboarding signatures on mainnet. @internal */
export const EXTENDED_SIGNING_DOMAIN = 'extended.exchange'

/** Description that marks the API keys this SDK creates. @internal */
export const EXTENDED_API_KEY_DESCRIPTION = 'LI.FI perps SDK'

/** Extended refuses requests without a `User-Agent`. @internal */
export const EXTENDED_USER_AGENT = 'lifi-perps-sdk'

/** Page size sent when the caller gives none: Extended returns a cursor on the last page too. @internal */
export const EXTENDED_DEFAULT_PAGE_LIMIT = 100

/**
 * Extended's flat fee schedule (0 bps maker / 2.5 bps taker), the same for
 * every account and market.
 *
 * @public
 */
export const EXTENDED_BASE_FEE_TIER = {
  maker: '0',
  taker: '0.00025',
}
