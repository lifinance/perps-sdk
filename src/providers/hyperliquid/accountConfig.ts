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
 * Mapping table:
 *
 * | descriptor.type          | projected values
 * |--------------------------|-----------------------------------------------
 * | APPROVE_AGENT            | []                  (no parameters)
 * | APPROVE_BUILDER_FEE      | []                  (no parameters)
 * | ACCOUNT_MODE             | [{ name: 'mode', value: config.abstractionMode }]
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` / `Provider.options` throw at runtime.
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

    // `config.abstractionMode === null` means abstraction has never been set;
    // callers fall back to the descriptor's `default` ParamOption.
    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: config.abstractionMode }],
      }

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
    case ActionType.APPROVE_READ_ONLY_TOKEN:
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
 * typed `HyperliquidAccountConfig`. Produces exactly one
 * `AccountConfigSetting` per descriptor, in `setup`-then-`options` order
 * (preserving the order in which the backend emits them).
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
