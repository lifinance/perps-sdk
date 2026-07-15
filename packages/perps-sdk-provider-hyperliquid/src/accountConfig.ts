import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfigSetting,
  HyperliquidAccountConfig,
  ProviderAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}

/**
 * Project a single Hyperliquid descriptor against the typed
 * `HyperliquidAccountConfig` into an `AccountConfigSetting`.
 *
 * Mapping table:
 *
 * | descriptor.type       | projected values
 * |-----------------------|----------------------------------------------
 * | APPROVE_AGENT         | []                  (no parameters)
 * | APPROVE_BUILDER_FEE   | []                  (no parameters)
 * | SET_REFERRAL          | []                  (no parameters)
 * | ACCOUNT_MODE          | [{ name: 'mode', value: config.abstractionMode }]
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` / `Provider.options` for Hyperliquid throw at runtime.
 */
function projectHyperliquidDescriptor(
  descriptor: ProviderAction,
  config: HyperliquidAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    case ActionType.APPROVE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.SET_REFERRAL:
      return { type: descriptor.type, values: [] }

    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: config.abstractionMode }],
      }

    case ActionType.APPROVE_INTEGRATOR:
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
    case ActionType.UPDATE_ASSET_COLLATERAL:
    case ActionType.REGISTER_API_KEY:
    case ActionType.APPROVE_READ_ONLY_TOKEN:
    case ActionType.SIWE_LOGIN:
    case ActionType.ACCEPT_PROVIDER_TERMS:
    case ActionType.DEPOSIT:
    case ActionType.META_VOTE:
    case ActionType.META_ACCEPT_TERMS:
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
 * `AccountConfigSetting` per descriptor, in `setup`-then-`options` order.
 *
 * @public
 */
export function projectHyperliquidConfigSettings(
  config: HyperliquidAccountConfig,
  setup: ProviderAction[],
  options: ProviderAction[]
): AccountConfigSetting[] {
  return [...setup, ...options].map((descriptor) =>
    projectHyperliquidDescriptor(descriptor, config)
  )
}
