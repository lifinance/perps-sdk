import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfigSetting,
  HyperliquidAccountConfig,
  ProviderAction,
  SetupAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { HlAbstractionMode } from './types/account.js'

// `null`, `'default'` and `'disabled'` are the same off state; a descriptor may
// enumerate either spelling of it.
const ABSTRACTION_OFF_VALUES: ReadonlySet<string> = new Set([
  HlAbstractionMode.DEFAULT,
  HlAbstractionMode.DISABLED,
])

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
 * | REVOKE_AGENT          | []                  (no parameters)
 * | APPROVE_BUILDER_FEE   | []                  (no parameters)
 * | SET_REFERRAL          | []                  (no parameters)
 * | ACCOUNT_MODE          | [{ name: 'mode', value: config.abstractionMode }] (off → offered off spelling)
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` for Hyperliquid throw at runtime.
 */
function projectHyperliquidDescriptor(
  descriptor: ProviderAction,
  config: HyperliquidAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    case ActionType.APPROVE_AGENT:
    case ActionType.REVOKE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.SET_REFERRAL:
      return { type: descriptor.type, values: [] }

    case ActionType.ACCOUNT_MODE: {
      const mode = config.abstractionMode
      const enumerated = descriptor.params?.[0]?.values ?? []
      // The off state projects as whichever off spelling the descriptor offers,
      // so the value always matches one of the options it is satisfied by.
      const matched =
        mode === null || ABSTRACTION_OFF_VALUES.has(mode)
          ? enumerated.find((option) =>
              ABSTRACTION_OFF_VALUES.has(option.value)
            )
          : enumerated.find((option) => option.value === mode)
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: matched?.value ?? mode }],
        satisfied: matched !== undefined,
      }
    }

    case ActionType.APPROVE_INTEGRATOR:
    case ActionType.ACCOUNT_TYPE:
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
    case ActionType.UPDATE_ASSET_COLLATERAL:
    case ActionType.REGISTER_API_KEY:
    case ActionType.APPROVE_READ_ONLY_TOKEN:
    case ActionType.SIWE_LOGIN:
    case ActionType.CREATE_DEPOSIT_ADDRESS:
    case ActionType.ACCEPT_PROVIDER_TERMS:
    case ActionType.DEPOSIT:
    case ActionType.META_ACCEPT_TERMS:
    case ActionType.META_ONBOARD:
    case ActionType.META_CREATE_REFERRAL_CODE:
    case ActionType.SYNC_FEE_ATTRIBUTION:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Hyperliquid account-config mapper has no projection for ` +
          `descriptor type '${descriptor.type}' — this ActionType is not ` +
          `valid on Provider.setup for Hyperliquid.`
      )

    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the Hyperliquid setup descriptors against the typed
 * `HyperliquidAccountConfig`. Produces exactly one `AccountConfigSetting` per
 * descriptor, in `Provider.setup` order.
 *
 * @public
 */
export function projectHyperliquidConfigSettings(
  config: HyperliquidAccountConfig,
  setup: SetupAction[]
): AccountConfigSetting[] {
  return setup.map((descriptor) =>
    projectHyperliquidDescriptor(descriptor, config)
  )
}
