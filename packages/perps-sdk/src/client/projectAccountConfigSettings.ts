import type {
  AccountConfig,
  AccountConfigSetting,
  LighterAccountConfig,
  ProviderActionDescriptor,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode } from '@lifi/perps-types'
import { PerpsError } from '../errors/PerpsError.js'
import { projectHyperliquidConfigSettings } from '../providers/hyperliquid/accountConfig.js'
import { assertNever } from '../utils/assertNever.js'

/**
 * Project a typed `AccountConfig` against the provider's `setup` + `options`
 * descriptors into `AccountConfigSetting[]`.
 *
 * Switches on `config.provider` to pick the per-provider mapper. The
 * `assertNever` exhaustiveness check in the `default` arm forces a compile
 * error whenever a new variant is added to `AccountConfig`.
 *
 * Produces exactly one `AccountConfigSetting` per descriptor in
 * `setup`-then-`options` order.
 *
 * @param config Typed account-state union (discriminated on `provider`).
 * @param setup  `Provider.setup` from the matching provider metadata.
 * @param options `Provider.options` from the matching provider metadata.
 */
export function projectAccountConfigSettings(
  config: AccountConfig,
  setup: ProviderSetup[],
  options: ProviderOption[]
): AccountConfigSetting[] {
  switch (config.provider) {
    case 'hyperliquid':
      return projectHyperliquidConfigSettings(config, setup, options)
    case 'lighter':
      return projectLighterConfigSettings(config, setup, options)
    default:
      return assertNever(config)
  }
}

/**
 * Inline projection for `LighterAccountConfig`. Mirrors the canonical
 * implementation in `@lifi/perps-sdk-provider-lighter`; duplicated here to
 * keep the core SDK free of a runtime dependency on the provider package.
 */
function projectLighterConfigSettings(
  config: LighterAccountConfig,
  setup: ProviderSetup[],
  options: ProviderOption[]
): AccountConfigSetting[] {
  return [...setup, ...options].map((descriptor) =>
    projectLighterDescriptor(descriptor, config)
  )
}

function projectLighterDescriptor(
  descriptor: ProviderActionDescriptor,
  config: LighterAccountConfig
): AccountConfigSetting {
  switch (descriptor.type) {
    case ActionType.REGISTER_API_KEY:
    case ActionType.APPROVE_READ_ONLY_TOKEN:
      return { type: descriptor.type, values: [] }

    case ActionType.ACCOUNT_MODE:
      return {
        type: descriptor.type,
        values: [{ name: 'mode', value: null }],
      }

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
