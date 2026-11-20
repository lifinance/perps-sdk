import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfig,
  AccountConfigSetting,
  ExtendedAccountConfig,
  ProviderAction,
  SetupAction,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
  )
}

/**
 * Project one Extended setup descriptor. Extended has two setup steps:
 * `CREATE_ACCOUNT` (the onboarding, which the backend sends) and
 * `REGISTER_API_KEY` (the API key, made in the client). Both are satisfied
 * when this device holds the credentials, which exist only after the account
 * does; on a new device the onboarding gives the existing account again. The
 * switch is exhaustive over `ActionType`, so an enum addition fails to compile.
 */
function projectExtendedDescriptor(
  descriptor: ProviderAction,
  config: ExtendedAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    case ActionType.CREATE_ACCOUNT:
    case ActionType.REGISTER_API_KEY:
      return {
        type: descriptor.type,
        values: [],
        satisfied: config.apiKeyRegistered,
      }
    case ActionType.SIWE_LOGIN:
    case ActionType.CREATE_DEPOSIT_ADDRESS:
    case ActionType.ACCEPT_PROVIDER_TERMS:
    case ActionType.SET_REFERRAL:
    case ActionType.APPROVE_AGENT:
    case ActionType.REVOKE_AGENT:
    case ActionType.APPROVE_BUILDER_FEE:
    case ActionType.APPROVE_INTEGRATOR:
    case ActionType.ACCOUNT_MODE:
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
    case ActionType.APPROVE_READ_ONLY_TOKEN:
    case ActionType.DEPOSIT:
    case ActionType.META_ACCEPT_TERMS:
    case ActionType.META_ONBOARD:
    case ActionType.META_CREATE_REFERRAL_CODE:
    case ActionType.ADD_WITHDRAWAL_ADDRESS:
    case ActionType.SYNC_FEE_ATTRIBUTION:
    case ActionType.REVOKE_BUILDER_FEE:
    case ActionType.REVOKE_SESSION_AGENT:
    case ActionType.REVOKE_INTEGRATOR:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Extended account-config mapper has no projection for descriptor type '${descriptor.type}'.`
      )
    default:
      return assertNever(descriptor.type)
  }
}

/**
 * Project the Extended setup descriptors against the typed
 * `ExtendedAccountConfig`, one `AccountConfigSetting` per descriptor in
 * `Provider.setup` order.
 *
 * @throws {PerpsError} `SDKError` for a config of another provider.
 * @public
 */
export function projectExtendedConfigSettings(
  config: AccountConfig,
  setup: SetupAction[]
): AccountConfigSetting[] {
  if (config.provider !== 'extended') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended account-config mapper received a '${config.provider}' config.`
    )
  }
  return setup.map((descriptor) =>
    projectExtendedDescriptor(descriptor, config)
  )
}
