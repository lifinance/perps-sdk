import type { FeeTier, LighterProviderKey } from '@lifi/perps-types'
import { LT_ASSET_ID_USDC } from './types/action.js'

/**
 * Lighter provider key as it appears on `Provider.key` from the backend.
 *
 * @public
 */
export const LIGHTER_PROVIDER_KEY = 'lighter'

/**
 * Provider key for the Lighter instance running on Robinhood chain.
 *
 * @public
 */
export const LIGHTER_RH_PROVIDER_KEY = 'lighter-rh'

/**
 * Category id for Lighter spot token holdings, matching the backend's Lighter
 * spot asset category. The perps category id is not a constant — it is read
 * from the fetched markets so it tracks the backend taxonomy.
 *
 * @public
 */
export const LIGHTER_SPOT_CATEGORY_ID = 'spot'

/**
 * Default mainnet REST and WS base URL for Lighter.
 *
 * @public
 */
export const DEFAULT_LIGHTER_REST_URL = 'https://mainnet.zklighter.elliot.ai'
/**
 * Default mainnet WebSocket stream URL for Lighter.
 *
 * @public
 */
export const DEFAULT_LIGHTER_WS_URL = 'wss://mainnet.zklighter.elliot.ai/stream'

/**
 * zkLighter L2 signing chain id for the Lighter mainnet deployment, from
 * `elliottech/lighter-python` v1.1.2 `lighter/endpoint_profiles.py`.
 *
 * @public
 */
export const LIGHTER_MAINNET_SIGNER_CHAIN_ID = 304

/**
 * Base URL the mainnet Lighter zkLighter explorer resolves a tx hash against
 * (`${base}${txHash}`).
 *
 * @public
 */
export const DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL =
  'https://app.lighter.xyz/explorer/logs/'

/**
 * The collateral asset a Lighter deployment settles in: the L2 asset index its
 * withdrawals, transfers and route moves are signed against, plus the symbol
 * shown for the collateral balance.
 *
 * @public
 */
export interface LighterCollateralAsset {
  /** L2 asset index, as `asset_id` on the deployment's `/api/v1/assetDetails`. */
  assetIndex: number
  displaySymbol: string
}

/**
 * Collateral asset per Lighter deployment, each read from that deployment's
 * `/api/v1/assetDetails`: mainnet settles in USDC, Robinhood chain in USDG.
 * Both sit at asset index 3 of their own registry — the same slot holds a
 * different token per deployment, so an index alone never identifies the asset.
 *
 * @public
 */
export const LIGHTER_COLLATERAL_ASSETS: Record<
  LighterProviderKey,
  LighterCollateralAsset
> = {
  [LIGHTER_PROVIDER_KEY]: Object.freeze({
    assetIndex: LT_ASSET_ID_USDC,
    displaySymbol: 'USDC',
  }),
  [LIGHTER_RH_PROVIDER_KEY]: Object.freeze({
    assetIndex: 3,
    displaySymbol: 'USDG',
  }),
}

/**
 * The immutable venue facts that distinguish one Lighter deployment from
 * another. The SDK owns one descriptor per supported deployment; consumers
 * select a deployment by picking its provider factory, never by assembling
 * these fields.
 *
 * @public
 */
export interface LighterDeployment {
  /** Wire-visible `Provider.key` and the plugin `type`; unique per deployment. */
  providerKey: LighterProviderKey
  restUrl: string
  wsUrl: string
  /** zkLighter L2 signing chain id this deployment's transactions are signed against. */
  signerChainId: number
  /**
   * Collateral asset this deployment settles in — signed into its withdrawals
   * and transfers, and reported as its collateral balance.
   */
  collateral: LighterCollateralAsset
  /**
   * Explorer tx base URL for transfer-activity links (`${base}${txHash}`).
   * When omitted, transfer links are not emitted for this deployment.
   */
  explorerTxBaseUrl?: string
}

/**
 * Lighter mainnet, as served by `lighterProvider()`.
 *
 * @public
 */
export const LIGHTER_MAINNET_DEPLOYMENT: LighterDeployment = Object.freeze({
  providerKey: LIGHTER_PROVIDER_KEY,
  restUrl: DEFAULT_LIGHTER_REST_URL,
  wsUrl: DEFAULT_LIGHTER_WS_URL,
  signerChainId: LIGHTER_MAINNET_SIGNER_CHAIN_ID,
  collateral: LIGHTER_COLLATERAL_ASSETS[LIGHTER_PROVIDER_KEY],
  explorerTxBaseUrl: DEFAULT_LIGHTER_EXPLORER_TX_BASE_URL,
})

/**
 * REST base URL for the Lighter Robinhood deployment.
 *
 * @public
 */
export const LIGHTER_RH_REST_URL = 'https://api.rh.lighter.xyz'
/**
 * WebSocket URL for the Lighter Robinhood deployment.
 *
 * @public
 */
export const LIGHTER_RH_WS_URL = 'wss://api.rh.lighter.xyz/stream'

/**
 * zkLighter L2 signing chain id for the Lighter Robinhood deployment, from
 * `elliottech/lighter-python` v1.1.2 `lighter/endpoint_profiles.py`
 * (`ROBINHOOD.chain_id`) and its `signer_client.py` host fallback. Distinct
 * from mainnet's 304 and from Robinhood's L1 chain id 4663 — signing with
 * either yields a venue-rejected transaction.
 *
 * @public
 */
export const LIGHTER_RH_SIGNER_CHAIN_ID = 466324

/**
 * Lighter on Robinhood chain, as served by `lighterRhProvider()`. No explorer
 * base URL: the RH zkLighter explorer is unpublished, so transfer links are
 * left unset rather than pointed at the mainnet explorer.
 *
 * @public
 */
export const LIGHTER_RH_DEPLOYMENT: LighterDeployment = Object.freeze({
  providerKey: LIGHTER_RH_PROVIDER_KEY,
  restUrl: LIGHTER_RH_REST_URL,
  wsUrl: LIGHTER_RH_WS_URL,
  signerChainId: LIGHTER_RH_SIGNER_CHAIN_ID,
  collateral: LIGHTER_COLLATERAL_ASSETS[LIGHTER_RH_PROVIDER_KEY],
  explorerTxBaseUrl: undefined,
})

/** @internal */
export const DEFAULT_TRADES_LIMIT = 50

/**
 * Lighter pairs each maker/taker fee with a 1e6 integer tick:
 *   fee_fraction = current_*_fee_tick / 1_000_000
 *
 * See lighter-python `paper_client/types.py:_FEE_TICK` for the canonical scale.
 *
 * @internal
 */
export const LIGHTER_FEE_TICK_SCALE = 1_000_000

/**
 * Scale of the integer `initial_margin_fraction` values Lighter publishes on
 * trade rows and order-book details: the integer is a percent times 100, so
 * `500` is 5.00% and `200` is 2.00%. Account positions publish the same
 * fraction as a plain percent string ("5.00") instead.
 *
 * @internal
 */
export const LIGHTER_IMF_PERCENT_SCALE = 100

/**
 * Lighter's public base fee tier (Standard Account): 0% maker / 0% taker on all
 * perps markets. Per-account Premium tiers exist but require auth to resolve;
 * unauthenticated quotes use this public base. Fractions, not basis points.
 *
 * @public
 */
export const LIGHTER_BASE_FEE_TIER: FeeTier = { maker: '0', taker: '0' }

/**
 * Wildcard `market_id` accepted by Lighter's per-market account endpoints to
 * indicate "every market". Used on `accountInactiveOrders`, `positionFunding`,
 * `liquidations`.
 *
 * @internal
 */
export const LIGHTER_ALL_MARKETS_WILDCARD = 255

/**
 * Lighter caps `limit` at 100 on positionFunding/liquidations endpoints.
 *
 * @internal
 */
export const LIGHTER_HISTORY_PAGE_SIZE = 100

/** @internal */
const LIGHTER_CODE_ACCOUNT_NOT_FOUND = 21100

/**
 * Lighter body `code` for a rejected/invalid auth token ("invalid auth string").
 *
 * @internal
 */
const LIGHTER_INVALID_AUTH_CODE = 20013

/**
 * Lighter body `code` values that mean success. Lighter is inconsistent per
 * endpoint: `/api/v1/account` returns `code: 200`, most others return `code: 0`.
 * A body with no `code` field is also success (no error channel present).
 *
 * @internal
 */
const LIGHTER_SUCCESS_CODES = new Set([0, 200])

/**
 * Lighter body `code` meaning "operation succeeded" on the non-`/sendTx`
 * mutation endpoints (`/changeAccountTier`, `/referral/use`). Any other code is
 * a business-rule rejection surfaced verbatim to the caller.
 *
 * @internal
 */
const LIGHTER_MUTATION_SUCCESS_CODE = 200

export {
  LIGHTER_CODE_ACCOUNT_NOT_FOUND,
  LIGHTER_INVALID_AUTH_CODE,
  LIGHTER_MUTATION_SUCCESS_CODE,
  LIGHTER_SUCCESS_CODES,
}
