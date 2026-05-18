import type {
  AccountConfigSetting,
  HyperliquidAccountConfig,
  ProviderActionDescriptor,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../../errors/PerpsError.js'
import { assertNever } from '../../utils/assertNever.js'

/**
 * Project a single Hyperliquid descriptor against the typed
 * `HyperliquidAccountConfig` into an `AccountConfigSetting`.
 *
 * The switch is exhaustive over `ActionType`: adding a new variant to the
 * enum forces a corresponding `case` here (otherwise `assertNever` raises a
 * compile error in the `default` arm). ActionTypes that are NOT valid on
 * `Provider.setup` / `Provider.options` throw at runtime — they should
 * never reach this code path because the backend only emits descriptors
 * for the documented account-level actions.
 *
 * Mapping table (Hyperliquid):
 *
 * | descriptor.type          | projected values
 * |--------------------------|-----------------------------------------------
 * | APPROVE_AGENT            | []                  (no parameters)
 * | APPROVE_BUILDER_FEE      | []                  (no parameters)
 * | ACCOUNT_MODE             | [{ name: 'mode', value: config.abstractionMode }]
 *
 * Any other ActionType on a Hyperliquid setup/options descriptor is a
 * descriptor-emission bug — the descriptor doesn't have a defined
 * projection on this provider.
 */
function projectHyperliquidDescriptor(
  descriptor: ProviderActionDescriptor,
  config: HyperliquidAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    // Zero-parameter user-approval descriptors. The "satisfied or not"
    // state for these comes from `checkSetup`'s unsatisfied list, not from
    // a projected value.
    case ActionType.APPROVE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
      return { type: descriptor.type, values: [] }

    // ACCOUNT_MODE: the descriptor's `mode` Param maps to
    // `config.abstractionMode`. `null` means abstraction has never been
    // set; the widget falls back to the descriptor's `default` ParamOption.
    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: config.abstractionMode }],
      }

    // The remainder of `ActionType` is enumerated explicitly so the
    // exhaustiveness check below catches enum additions at compile time.
    // None of these should appear on a Hyperliquid setup/options
    // descriptor — they're trading actions (or actions that the provider
    // doesn't declare here, e.g. ACCOUNT_TYPE / REGISTER_API_KEY are
    // Lighter-only).
    case ActionType.ACCOUNT_TYPE:
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
    case ActionType.REGISTER_API_KEY:
    case ActionType.DEPOSIT:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Hyperliquid account-config mapper has no projection for ` +
          `descriptor type '${descriptor.type}' — this ActionType is not ` +
          `valid on Provider.setup / Provider.options for Hyperliquid.`
      )

    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the union of Hyperliquid setup + options descriptors against the
 * typed `HyperliquidAccountConfig` for widget consumption. Produces exactly
 * one `AccountConfigSetting` per descriptor, in `setup`-then-`options`
 * order (preserving the order in which the backend emits them).
 *
 * The widget consumes the returned settings against the same descriptors
 * (paired by `AccountConfigSetting.type === descriptor.type`) and reads
 * `values[i].value` for each `Param` the descriptor declared.
 *
 * @param config Typed account state for the Hyperliquid account.
 * @param setup  `Provider.setup` array as emitted by `/providers`.
 * @param options `Provider.options` array as emitted by `/providers`.
 */
export function projectHyperliquidConfigSettings(
  config: HyperliquidAccountConfig,
  setup: ProviderSetup[],
  options: ProviderOption[]
): AccountConfigSetting[] {
  return [...setup, ...options].map((descriptor) =>
    projectHyperliquidDescriptor(descriptor, config)
  )
}
