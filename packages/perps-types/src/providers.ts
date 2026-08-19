import type { Asset } from './asset.js'
import type { ActionType, PerpsSigner, SigningMethod } from './enums.js'
import type { OhlcvInterval } from './market.js'

/** A fixed option value presented for a provider action parameter. @public */
export interface ParamOption {
  value: string
  label: string
}

/**
 * Metadata describing one provider action parameter and its UI constraints.
 *
 * @public
 */
export interface Param {
  /** Wire key for the action params object: `{ [param.name]: value }`. */
  name: string
  /**
   * Primitive type of the wire value. `ParamOption.value` and `default`
   * stay stringified regardless of type; clients parse per `type`
   * (`'true'`/`'false'` for booleans, decimal strings for numbers) before
   * writing the typed value into the action params object.
   */
  type: 'string' | 'boolean' | 'number'
  /** Present if and only if the parameter has a fixed enumeration of admissible values. */
  values?: ParamOption[]
  default?: ParamOption
  readOnly?: boolean
}

/**
 * A single provider action. The same shape backs `Provider.setup`,
 * `Provider.options`, and `Provider.actions` — categorisation lives in which
 * array it sits in, not in the type. The core three fields are always present;
 * the rest are presentation/ordering hints provided per-action in the
 * provider's hardcoded metadata.
 * @public
 */
export interface ProviderAction {
  type: ActionType
  signers: PerpsSigner[]
  signingMethod: SigningMethod
  /**
   * Human label. Drives the card heading in the setup/options modals, and may
   * also front an in-flight trading action ("{title} is working…").
   */
  title?: string
  description?: string
  /** UI form fields the widget renders to collect input for this action. */
  params?: Param[]
  /**
   * Ascending order in which the user satisfies setup steps. Cloud-init
   * convention: 10, 20, 30, … with 99 reserved for "always last"; the gaps
   * leave room to insert steps later without renumbering. Lower runs first;
   * a step may depend on every lower-sequenced step already being satisfied.
   */
  sequence?: number
}

/**
 * Provider-attached advisory shown against a market. Provider-agnostic: the
 * producer decides when to emit one (e.g. an HL HIP-3 sub-dex risk warning).
 * @public
 */
export interface TradeNotice {
  /** Maps to the widget's panel styling: `warn` → warning, `info` → info. */
  level: 'info' | 'warn'
  /** Plaintext; any URL is rendered as text, not a hyperlink. */
  message: string
}

/**
 * Provider category metadata, including quote asset and optional market notice.
 *
 * @public
 */
export interface ProviderCategory {
  id: string
  logoURI?: string
  /** `null` for the "spot" category — no single fixed quote. */
  quoteAsset: Asset | null
  tradeNotice?: TradeNotice
}

/** Provider-wide funding cadence metadata, expressed in seconds. @public */
export interface ProviderFunding {
  /** Number of seconds represented by the provider's funding rate. */
  ratePeriodSeconds: number
  /** Number of seconds between funding payouts. */
  payoutCadenceSeconds: number
}

/**
 * Provider descriptor containing capabilities, actions, categories, and
 * optional deposit/trading limits.
 *
 * @public
 */
export interface Provider {
  key: string
  name: string
  logoURI: string
  /**
   * Public attribution code supplied by the backend for authenticated
   * referral-state comparison. Absent when the provider has no referral setup.
   */
  referralCode?: string
  signingMethod: SigningMethod
  /** When false, the provider is announced but not yet selectable in clients. */
  active: boolean
  setup: ProviderAction[]
  options: ProviderAction[]
  actions: ProviderAction[]
  categories: ProviderCategory[]
  wsUrl?: string
  /** Global funding metadata shared by all markets at this provider. */
  funding?: ProviderFunding
  /**
   * Settlement chain id for this venue, aligned to `@lifi/types` `ChainId`
   * values. Absent when the provider has no settlement chain.
   */
  chainId?: number
  /** Absent means no minimum advertised. */
  minDepositUsd?: number
  /**
   * Minimum order notional value in USD. Feeds the SDK's `validateMargin`
   * `minMarginUsd` parameter. Absent means no minimum advertised.
   */
  minOrderValueUsd?: number
  /**
   * Minimum order notional value in USD for reduce-only orders, when the
   * provider applies a lower floor than `minOrderValueUsd`. Absent means
   * reduce-only orders use the same floor as `minOrderValueUsd`.
   */
  minReduceOrderValueUsd?: number
  /** Minimum withdrawal notional in USD. Absent means no minimum advertised. */
  minWithdrawalUsd?: number
  /** Flat deposit fee in USD the provider charges. Absent means no fee advertised. */
  depositFeeUsd?: number
  /** Flat withdrawal fee in USD the provider charges. Absent means no fee advertised. */
  withdrawalFeeUsd?: number
  /**
   * Candle intervals this provider supports for OHLCV/chart requests, in
   * ascending order. Drives the client's chart interval selector. Empty for
   * providers that expose no candle data.
   */
  supportedIntervals: OhlcvInterval[]
}

/** Response containing provider descriptors available to the client. @public */
export interface ProvidersResponse {
  providers: Provider[]
}
