---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-ondo': major
---

Add `SetupKind` and remove `Provider.options`.

Backend requirement: this release needs a `/providers` response that emits `kind` on every `Provider.setup` descriptor and serves the former options (Lighter `ACCOUNT_TYPE` and `ACCOUNT_MODE`, Hyperliquid `ACCOUNT_MODE`) as `preference` setup steps. Against an older backend, every `PerpsClient` call that reads provider metadata throws `PerpsErrorCode.SDKError` naming the kind-less step, instead of reporting a not-onboarded account as ready.

Breaking changes:

- `Provider.setup` is now `SetupAction[]`. Every descriptor carries a `kind` of `approval`, `automatic` or `preference`. A descriptor with no known `kind`, or an `automatic` descriptor whose `signers` include `USER`, is rejected with `PerpsErrorCode.SDKError`.
- `Provider.options` is deleted. A former option is a `preference` setup step.
- `PerpsProviderPlugin.projectConfig(config, setup)` takes two arguments. The `options` argument is gone.
- `PerpsProviderPlugin.internalSetupActions` is removed. `kind: 'automatic'` states the same fact.
- `PerpsClient.buildProviderSetup` stages only an `approval` step.

Migration:

- Read former options from `Provider.setup` where `kind === 'preference'`, not from `Provider.options`.
- Drop `internalSetupActions` from a custom plugin; the backend declares those steps `automatic`.
- Call `projectConfig(config, setup)` with two arguments.

New behaviour:

- `PerpsClient.checkSetup` reads a `preference` satisfied state from the plugin projection and hides an `automatic` step. For an unsatisfied `preference` whose every parameter declares a `default` (one of its `values`, when it enumerates any), the SDK sends those defaults, parsed per `Param.type`, with plugin setup params on top. A USER-signed step is never applied on the user's behalf.
- `PerpsClient.executeProviderSetupAction` rejects a step while a lower-`sequence` visible step is unsatisfied. A lower-`sequence` preference the SDK can apply is applied first, so a cached step from `checkSetup` stays executable.
- The Lighter plugin maps venue error code `21520` to `PerpsErrorCode.SetupRequired`, including on its client-executed `/changeAccountTier` and `/referral/use` calls.
- The Lighter plugin reads the account tier before it signs an order batch and throws `PerpsErrorCode.SetupRequired` when the venue reports a tier the `ACCOUNT_TYPE` step does not accept. An unreadable tier does not block the order.
- The Hyperliquid `ACCOUNT_MODE` projection reports the off state as the off spelling the descriptor offers.
