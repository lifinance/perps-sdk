---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-ondo': major
---

Add `SetupKind` and remove `Provider.options`.

Breaking changes:

- `Provider.setup` is now `SetupAction[]`. Every descriptor carries a `kind` of `approval`, `automatic` or `preference`.
- `Provider.options` is deleted. A former option is a `preference` setup step.
- `PerpsProviderPlugin.projectConfig(config, setup)` takes two arguments. The `options` argument is gone.
- `PerpsProviderPlugin.internalSetupActions` is removed. `kind: 'automatic'` states the same fact.
- `PerpsClient.buildProviderSetup` stages only an `approval` step.

New behaviour:

- `PerpsClient.checkSetup` reads a `preference` satisfied state from the plugin projection, hides an `automatic` step, and applies a parameter default for an unsatisfied `preference`.
- `PerpsClient.executeProviderSetupAction` rejects a step while a lower-`sequence` visible step is unsatisfied.
- The Lighter plugin maps venue error code `21520` to `PerpsErrorCode.SetupRequired` and asserts the account tier before it signs an order.
