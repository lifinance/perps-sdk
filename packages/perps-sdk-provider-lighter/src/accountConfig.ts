import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfigSetting,
  LighterAccountConfig,
  ProviderAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}

/**
 * `account_type` on Lighter's `DetailedAccount` is a `StrictInt` with no
 * documented integer ↔ name mapping in the public SDKs. Empirical ordering:
 * 0 = standard, 1 = premium (from `AccountTier` enum + `/changeAccountTier`
 * wire strings). Plus tier (likely `2`) is omitted — an unmapped int projects
 * to null and surfaces as "tier not detected", so drift is observable.
 */
const LIGHTER_ACCOUNT_TYPE_STANDARD = 0
const LIGHTER_ACCOUNT_TYPE_PREMIUM = 1

const ACCOUNT_TYPE_INT_TO_WIRE: Readonly<Record<number, string>> = {
  [LIGHTER_ACCOUNT_TYPE_STANDARD]: 'standard',
  [LIGHTER_ACCOUNT_TYPE_PREMIUM]: 'premium',
}

// `account_trading_mode` on `DetailedAccount`: 0 = Classic/Simple (segregated
// margin), 1 = Unified Trading Account (cross-asset margin). Wire strings match
// the backend descriptor's ParamOption values. An unmapped int projects to null.
const LIGHTER_ACCOUNT_MODE_SIMPLE = 0
const LIGHTER_ACCOUNT_MODE_UNIFIED = 1

const ACCOUNT_MODE_INT_TO_WIRE: Readonly<Record<number, string>> = {
  [LIGHTER_ACCOUNT_MODE_SIMPLE]: 'simpleTradingAccount',
  [LIGHTER_ACCOUNT_MODE_UNIFIED]: 'unifiedTradingAccount',
}

/**
 * Project a single Lighter descriptor against the typed
 * `LighterAccountConfig` into an `AccountConfigSetting`.
 *
 * Mapping table:
 *
 * | descriptor.type           | projected values
 * |---------------------------|--------------------------------------------------
 * | REGISTER_API_KEY          | []                  (no parameters)
 * | APPROVE_READ_ONLY_TOKEN   | []                  (no parameters)
 * | SET_REFERRAL              | []                  (no parameters)
 * | APPROVE_INTEGRATOR        | []                  (no parameters)
 * | ACCOUNT_MODE              | [{ name: 'mode', value: config.accountTradingMode }]
 * | ACCOUNT_TYPE              | [{ name: 'tier', value: config.accountType }]
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` / `Provider.options` throw at runtime.
 */
function projectLighterDescriptor(
  descriptor: ProviderAction,
  config: LighterAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    // `REGISTER_API_KEY` is satisfied only when the locally-held keypair
    // matches the key registered on-chain at this slot — computed client-side
    // in `getAccount` (the SDK owns account reads + the keystore). Backend
    // staging is mutation-only; it never decides satisfaction.
    case ActionType.REGISTER_API_KEY:
      return {
        type: descriptor.type,
        values: [],
        satisfied: config.apiKeyRegistered,
      }
    // `APPROVE_READ_ONLY_TOKEN` is a client-only flow that never reaches
    // the backend, so its satisfaction state lives entirely in the typed
    // `LighterAccountConfig` projection.
    case ActionType.APPROVE_READ_ONLY_TOKEN:
      return {
        type: descriptor.type,
        values: [],
        satisfied: config.readOnlyTokenApproved,
      }

    // `SET_REFERRAL` is satisfied when LI.FI's referral code is the one applied
    // to the account — an SDK-direct read (`getAccount` → `referralPresent`),
    // since the applied referral is a per-user, auth-gated read. Lighter referral
    // is mutable, so an account on another integrator's code stays gateable.
    case ActionType.SET_REFERRAL:
      return {
        type: descriptor.type,
        values: [],
        satisfied: config.referralPresent,
      }

    // Backend-gated setup step: `checkSetup` → `createAction` decides
    // satisfaction (the backend emits no actions once satisfied), so the
    // projection carries no local state.
    case ActionType.APPROVE_INTEGRATOR:
      return { type: descriptor.type, values: [] }

    // `mode` decodes the raw `account_trading_mode` integer to the descriptor's
    // wire strings (`unifiedTradingAccount` / `simpleTradingAccount`).
    // Unrecognised integers project to `null`.
    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [
          {
            name: 'mode',
            value: ACCOUNT_MODE_INT_TO_WIRE[config.accountTradingMode] ?? null,
          },
        ],
      }

    // `tier` is the wire string `/changeAccountTier` accepts; we decode the
    // raw integer `config.accountType` Lighter publishes via the mapping
    // above so the projection matches the descriptor's enumerated values.
    // Unrecognised integers project to `null` (surfaces as "tier not
    // detected" — the widget still lets the user pick a value).
    case ActionType.ACCOUNT_TYPE:
      return {
        type: descriptor.type,
        values: [
          {
            name: 'tier',
            value: ACCOUNT_TYPE_INT_TO_WIRE[config.accountType] ?? null,
          },
        ],
      }

    case ActionType.APPROVE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.SEND_ASSET:
    case ActionType.WITHDRAWAL:
    case ActionType.TRANSFER:
    case ActionType.PLACE_ORDER:
    case ActionType.PLACE_TRIGGER_ORDER:
    case ActionType.CANCEL_ORDER:
    case ActionType.CANCEL_ALL_ORDERS:
    case ActionType.MODIFY_ORDER:
    case ActionType.UPDATE_LEVERAGE:
    case ActionType.UPDATE_POSITION_MARGIN:
    case ActionType.SIWE_LOGIN:
    case ActionType.CREATE_DEPOSIT_ADDRESS:
    case ActionType.ACCEPT_PROVIDER_TERMS:
    case ActionType.UPDATE_ASSET_COLLATERAL:
    case ActionType.DEPOSIT:
    case ActionType.META_VOTE:
    case ActionType.META_ACCEPT_TERMS:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Lighter account-config mapper has no projection for ` +
          `descriptor type '${descriptor.type}' — this ActionType is not ` +
          `valid on Provider.setup / Provider.options for Lighter.`
      )

    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the union of Lighter setup + options descriptors against the typed
 * `LighterAccountConfig`. Produces exactly one `AccountConfigSetting` per
 * descriptor, in `setup`-then-`options` order (preserving the order in which
 * the backend emits them).
 *
 * @param config Typed account state for the Lighter account.
 * @param setup  `Provider.setup` array as emitted by `/providers`.
 * @param options `Provider.options` array as emitted by `/providers`.
 * @public
 */
export function projectLighterConfigSettings(
  config: LighterAccountConfig,
  setup: ProviderAction[],
  options: ProviderAction[]
): AccountConfigSetting[] {
  return [...setup, ...options].map((descriptor) =>
    projectLighterDescriptor(descriptor, config)
  )
}
