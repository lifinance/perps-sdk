import { PerpsError } from '@lifi/perps-sdk'
import type {
  AccountConfigSetting,
  LighterAccountConfig,
  ProviderActionDescriptor,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'

function assertNever(value: never): never {
  throw new Error(
    `Unreachable: exhaustiveness check failed for value ${JSON.stringify(value)}`
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
 * | ACCOUNT_MODE              | [{ name: 'mode', value: null }]  (Lighter has no
 * |                           |  abstraction-mode equivalent; read-only here)
 * | ACCOUNT_TYPE              | [{ name: 'tier', value: config.accountType }]
 *
 * The switch is exhaustive over `ActionType` so enum additions force a
 * compile error in the `default` arm. ActionTypes that are not valid on
 * `Provider.setup` / `Provider.options` throw at runtime.
 */
function projectLighterDescriptor(
  descriptor: ProviderActionDescriptor,
  config: LighterAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    // `REGISTER_API_KEY` satisfaction is driven by the backend's `checkSetup`
    // staging — leave `satisfied` undefined and let callers fold both signals.
    case ActionType.REGISTER_API_KEY:
      return { type: descriptor.type, values: [] }
    // `APPROVE_READ_ONLY_TOKEN` is a client-only flow that never reaches
    // the backend, so its satisfaction state lives entirely in the typed
    // `LighterAccountConfig` projection.
    case ActionType.APPROVE_READ_ONLY_TOKEN:
      return {
        type: descriptor.type,
        values: [],
        satisfied: config.readOnlyTokenApproved,
      }

    // Lighter exposes no abstraction-mode equivalent; if a backend descriptor
    // surfaces ACCOUNT_MODE on Lighter it always projects `null` and callers
    // fall back to the descriptor's `default` ParamOption.
    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: null }],
      }

    // `tier` maps to the raw integer `config.accountType` Lighter publishes;
    // decoding to a human label is the caller's responsibility.
    case ActionType.ACCOUNT_TYPE:
      return {
        type: descriptor.type,
        values: [{ name: 'tier', value: config.accountType }],
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
 * Project the union of Lighter setup + options descriptors against the typed
 * `LighterAccountConfig`. Produces exactly one `AccountConfigSetting` per
 * descriptor, in `setup`-then-`options` order (preserving the order in which
 * the backend emits them).
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
