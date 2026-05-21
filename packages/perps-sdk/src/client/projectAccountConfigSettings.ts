import type {
  AccountConfig,
  AccountConfigSetting,
  ProviderOption,
  ProviderSetup,
} from '@lifi/perps-types'
import { projectHyperliquidConfigSettings } from '../providers/hyperliquid/accountConfig.js'
import { projectLighterConfigSettings } from '../providers/lighter/accountConfig.js'
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
