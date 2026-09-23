import { isSetupOptionFor, PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfigSetting,
  LighterAccountConfig,
  SetupAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import {
  LT_ACCOUNT_TRADING_MODE_SIMPLE,
  LT_ACCOUNT_TRADING_MODE_UNIFIED,
} from './types/action.js'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}

// Wire strings match the modes the backend's ACCOUNT_MODE options bind. An
// unmapped int projects to null.
const ACCOUNT_MODE_INT_TO_WIRE: Readonly<Record<number, string>> = {
  [LT_ACCOUNT_TRADING_MODE_SIMPLE]: 'simpleTradingAccount',
  [LT_ACCOUNT_TRADING_MODE_UNIFIED]: 'unifiedTradingAccount',
}

/**
 * Resolve the account tier to the wire string `changeAccountTier` accepts.
 * `userTierName` decides it, but only when an ACCOUNT_TYPE option binds that
 * tier: Lighter owns that vocabulary, so an unrecognised value resolves `null`
 * instead of a mis-reported tier. An absent `userTierName` (no
 * `/accountLimits` read) resolves `null`.
 */
export function resolveAccountTier(
  descriptor: SetupAction,
  userTierName: string | undefined
): string | null {
  if (userTierName === undefined) {
    return null
  }
  return boundAccountTiers(descriptor).includes(userTierName)
    ? userTierName
    : null
}

/** The tiers the ACCOUNT_TYPE step's options bind. */
export function boundAccountTiers(descriptor: SetupAction): string[] {
  return (descriptor.options ?? []).flatMap((option) =>
    isSetupOptionFor(option, ActionType.ACCOUNT_TYPE)
      ? [option.params.tier]
      : []
  )
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
 * | ACCOUNT_TYPE              | [{ name: 'tier', value: resolveAccountTier(…) }]
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` throw at runtime.
 */
function projectLighterDescriptor(
  descriptor: SetupAction,
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

    // `SET_REFERRAL` persists its confirmed code beside the local API key.
    // The account read compares that marker with this instance's runtime code.
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

    // `mode` decodes the raw `account_trading_mode` integer to the wire strings
    // the options bind (`unifiedTradingAccount` / `simpleTradingAccount`).
    // Unrecognised integers project to `null`.
    case ActionType.ACCOUNT_MODE: {
      const mode = ACCOUNT_MODE_INT_TO_WIRE[config.accountTradingMode] ?? null
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: mode }],
        satisfied: (descriptor.options ?? []).some(
          (option) =>
            isSetupOptionFor(option, ActionType.ACCOUNT_MODE) &&
            option.params.mode === mode
        ),
      }
    }

    // An unresolved `tier` projects `null` and reads unsatisfied; while it
    // stays so the SDK executes the default option, and the user can still
    // pick a tier.
    case ActionType.ACCOUNT_TYPE: {
      const tier = resolveAccountTier(descriptor, config.userTierName)
      return {
        type: descriptor.type,
        values: [{ name: 'tier', value: tier }],
        satisfied: tier !== null,
      }
    }

    case ActionType.APPROVE_AGENT:
    case ActionType.REVOKE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.SEND_ASSET:
    case ActionType.WITHDRAWAL:
    case ActionType.TRANSFER:
    case ActionType.PLACE_ORDER:
    case ActionType.PLACE_TRIGGER_ORDER:
    case ActionType.PLACE_TWAP_ORDER:
    case ActionType.CANCEL_ORDER:
    case ActionType.CANCEL_ALL_ORDERS:
    case ActionType.CANCEL_TWAP_ORDER:
    case ActionType.MODIFY_ORDER:
    case ActionType.UPDATE_LEVERAGE:
    case ActionType.UPDATE_POSITION_MARGIN:
    case ActionType.SIWE_LOGIN:
    case ActionType.CREATE_DEPOSIT_ADDRESS:
    case ActionType.ACCEPT_PROVIDER_TERMS:
    case ActionType.UPDATE_ASSET_COLLATERAL:
    case ActionType.DEPOSIT:
    case ActionType.META_ACCEPT_TERMS:
    case ActionType.META_ONBOARD:
    case ActionType.META_CREATE_REFERRAL_CODE:
    case ActionType.SYNC_FEE_ATTRIBUTION:
    case ActionType.REVOKE_BUILDER_FEE:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Lighter account-config mapper has no projection for ` +
          `descriptor type '${descriptor.type}' — this ActionType is not ` +
          `valid on Provider.setup for Lighter.`
      )

    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the Lighter setup descriptors against the typed
 * `LighterAccountConfig`. Produces exactly one `AccountConfigSetting` per
 * descriptor, preserving the order in which the backend emits them.
 *
 * @public
 */
export function projectLighterConfigSettings(
  config: LighterAccountConfig,
  setup: SetupAction[]
): AccountConfigSetting[] {
  return setup.map((descriptor) => projectLighterDescriptor(descriptor, config))
}
