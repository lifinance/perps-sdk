import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfig,
  AccountConfigSetting,
  OndoAccountConfig,
  ProviderAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}

/**
 * Project a single Ondo descriptor against the typed `OndoAccountConfig`
 * into an `AccountConfigSetting`. Ondo has exactly one setup descriptor —
 * `SIWE_LOGIN` — whose satisfaction is the presence of a live session token.
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` / `Provider.options` throw at runtime.
 */
function projectOndoDescriptor(
  descriptor: ProviderAction,
  config: OndoAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    case ActionType.SIWE_LOGIN:
      return {
        type: descriptor.type,
        values: [
          { name: 'authTokenExpiry', value: config.authTokenExpiry ?? null },
        ],
        satisfied: config.loggedIn,
      }

    case ActionType.APPROVE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.SET_REFERRAL:
    case ActionType.ACCOUNT_MODE:
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
    case ActionType.META_VOTE:
    case ActionType.META_ACCEPT_TERMS:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Ondo account-config mapper has no projection for descriptor type ` +
          `'${descriptor.type}' — this ActionType is not valid on ` +
          `Provider.setup / Provider.options for Ondo.`
      )

    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the union of Ondo setup + options descriptors against the typed
 * `OndoAccountConfig`. Produces exactly one `AccountConfigSetting` per
 * descriptor, in `setup`-then-`options` order.
 *
 * @param config Typed account state; a non-`ondo` config throws `SDKError`.
 * @param setup  `Provider.setup` array as emitted by `/providers`.
 * @param options `Provider.options` array as emitted by `/providers`.
 * @public
 */
export function projectOndoConfigSettings(
  config: AccountConfig,
  setup: ProviderAction[],
  options: ProviderAction[]
): AccountConfigSetting[] {
  if (config.provider !== 'ondo') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Ondo account-config mapper received a '${config.provider}' config.`
    )
  }
  return [...setup, ...options].map((descriptor) =>
    projectOndoDescriptor(descriptor, config)
  )
}
