import type {
  AccountConfigSetting,
  LighterAccountConfig,
  ProviderActionDescriptor,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../../errors/PerpsError.js'
import { assertNever } from '../../utils/assertNever.js'

/**
 * Project a single Lighter descriptor against the typed
 * `LighterAccountConfig` into an `AccountConfigSetting`.
 *
 * The switch is exhaustive over `ActionType`: adding a new variant to the
 * enum forces a corresponding `case` here (otherwise `assertNever` raises a
 * compile error in the `default` arm). ActionTypes that are NOT valid on
 * `Provider.setup` / `Provider.options` throw at runtime — they should
 * never reach this code path because the backend only emits descriptors
 * for the documented account-level actions.
 *
 * Mapping table (Lighter):
 *
 * | descriptor.type    | projected values
 * |--------------------|-------------------------------------------------
 * | REGISTER_API_KEY   | []                  (no parameters)
 * | ACCOUNT_MODE       | [{ name: 'mode', value: null }]  (always null —
 * |                    |  Lighter has no abstraction-mode equivalent;
 * |                    |  the descriptor is read-only on this provider)
 * | ACCOUNT_TYPE       | [{ name: 'tier', value: config.accountType }]
 *
 * Any other ActionType on a Lighter setup/options descriptor is a
 * descriptor-emission bug — the descriptor doesn't have a defined
 * projection on this provider.
 */
function projectLighterDescriptor(
  descriptor: ProviderActionDescriptor,
  config: LighterAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    // Zero-parameter user-approval descriptor. The "satisfied or not"
    // state comes from `checkSetup`'s unsatisfied list and the
    // `config.apiKeyRegistered` flag, not from a projected value.
    case ActionType.REGISTER_API_KEY:
      return { type: descriptor.type, values: [] }

    // Lighter exposes no abstraction-mode equivalent — if a future
    // backend descriptor surfaces ACCOUNT_MODE on Lighter (e.g. as a
    // read-only display), it always projects `null`. The widget then
    // falls back to the descriptor's `default` ParamOption.
    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: null }],
      }

    // ACCOUNT_TYPE: the descriptor's `tier` Param maps to
    // `config.accountType` — the raw integer Lighter publishes. Decoding
    // to a human label is the widget's responsibility once Lighter
    // publishes the integer→label table.
    case ActionType.ACCOUNT_TYPE:
      return {
        type: descriptor.type,
        values: [{ name: 'tier', value: config.accountType }],
      }

    // The remainder of `ActionType` is enumerated explicitly so the
    // exhaustiveness check below catches enum additions at compile time.
    // None of these should appear on a Lighter setup/options descriptor.
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
    case ActionType.DEPOSIT:
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
 * Project the union of Lighter setup + options descriptors against the
 * typed `LighterAccountConfig` for widget consumption. Produces exactly
 * one `AccountConfigSetting` per descriptor, in `setup`-then-`options`
 * order (preserving the order in which the backend emits them).
 *
 * @param config Typed account state for the Lighter account.
 * @param setup  `Provider.setup` array as emitted by `/providers`.
 * @param options `Provider.options` array as emitted by `/providers`.
 */
export function projectLighterConfigSettings(
  config: LighterAccountConfig,
  setup: ProviderSetup[],
  options: ProviderOption[]
): AccountConfigSetting[] {
  return [...setup, ...options].map((descriptor) =>
    projectLighterDescriptor(descriptor, config)
  )
}
