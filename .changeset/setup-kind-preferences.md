---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-ondo': major
---

Describe every setup step and action by `signer`, `relay`, `options` and `revoke`, and remove `Provider.options`.

Backend requirement: this release needs a `/providers` response that emits a single `signer` and a `relay` on every `Provider.setup` and `Provider.actions` descriptor, and `options` and `revoke` on every setup step. The former options (Lighter `ACCOUNT_TYPE` and `ACCOUNT_MODE`, Hyperliquid `ACCOUNT_MODE`) are choice setup steps. Against an older backend, every `PerpsClient` call that reads provider metadata throws `PerpsErrorCode.SDKError` that names the step, instead of reporting a not-onboarded account as ready. The SDK also rejects a `revoke` that `Provider.actions` does not declare, and a step with more than one `default` option.

Breaking changes:

- `ProviderAction.signers: PerpsSigner[]` is now `ProviderAction.signer: PerpsSigner`.
- `ProviderAction.relay: ActionRelay` (`API` or `CLIENT`) is new and required.
- `Provider.setup` is now `SetupAction[]`. A `SetupAction` carries `options: SetupOption[] | null` and `revoke: ActionType | null`. A `SetupOption` binds `{ title, type, params }` and can mark `default: true`.
- `Provider.options` is deleted. A former option is a choice setup step.
- `ActionType.REVOKE_BUILDER_FEE` is new.
- `SignActionsContext.signers` is now `SignActionsContext.signer`, and `PerpsProviderPlugin.resolveActionRequest` takes one `PerpsSigner`.
- `PerpsProviderPlugin.projectConfig(config, setup)` takes two arguments. The `options` argument is gone.
- `PerpsProviderPlugin.internalSetupActions` is removed. An `SDK`-signed non-choice step states the same fact.
- `PerpsClient.executeProviderOption` takes `{ provider, address, option }` and executes the option's bound `type` and `params`.
- `selectUserSetupActions` takes `SetupAction[]`.
- `PerpsClient.buildProviderSetup` stages only a `USER`-signed non-choice step.

Migration:

- Read `descriptor.signer` in place of `descriptor.signers`.
- Read former options from `Provider.setup` where `options !== null`, not from `Provider.options`.
- Pass the chosen `SetupOption` to `executeProviderOption`.
- Drop `internalSetupActions` from a custom plugin.
- Call `projectConfig(config, setup)` with two arguments.

New behaviour:

- `PerpsClient.checkSetup` shows every choice step and a `USER`-signed non-choice step on the checklist, and hides and executes an `SDK`-signed non-choice step. A choice step is never staged; its satisfied state comes from the plugin projection. While an `SDK`-signed choice is unsatisfied, the SDK executes its `default` option verbatim. The SDK never executes a `USER`-signed choice.
- `SetupChecklistItem.selected` is the option whose bound params equal the projected values, or `null`.
- `PerpsClient.executeProviderRevoke({ provider, address, step })` executes the step's `revoke` action, signed by that action's `Provider.actions` descriptor. It throws `PerpsErrorCode.SDKError` when `revoke` is `null`.
- `isSetupOptionFor(option, type)` narrows a `SetupOption` to its bound `ActionType`.
- `PerpsClient.executeProviderSetupAction` rejects a step while a lower-`sequence` visible step is unsatisfied, and names that step. A lower-`sequence` `SDK`-signed choice with a `default` option is executed first, so a cached step from `checkSetup` stays executable.
- The Lighter plugin maps venue error code `21520` to `PerpsErrorCode.SetupRequired`, including on its client-executed `/changeAccountTier` and `/referral/use` calls.
- The Lighter plugin reads the account tier before it signs an order batch and throws `PerpsErrorCode.SetupRequired` when the venue reports a tier no `ACCOUNT_TYPE` option binds. An unreadable tier or setup descriptor does not block the order.
- The Hyperliquid `ACCOUNT_MODE` projection reads `null`, `default` and `disabled` as the off option, and reads a mode no option binds, such as `dexAbstraction`, as unsatisfied.
