---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk-provider-ondo': major
---

Add the `UserActionStatus` lifecycle status to every `ActionResult` and keep complete execution reports.

- `@lifi/perps-types` exports `UserActionStatus` (`Created`, `Indeterminate`, `Submitted`, `Accepted`, `Failed`). `ActionResult` is a union of `AcknowledgedActionResult`, `IndeterminateActionResult` and `FailedActionResult`. The `success` field is removed. A `FailedActionResult` has `refused: true` when the venue refused the action.
- `executeProviderSetupAction`, `executeProviderOption` and `executeProviderRevoke` return `ExecuteActionResponse` and not `void`. These methods and `submitOnboarding` do not throw for a refused or uncertain step. The report holds that step.
- `PerpsProviderPlugin.signActions` returns `SignActionsResult` (`{ signed, executed }`). The client-executed results (Lighter token-auth, confirmed EVM legs) go into the report before the backend results.
- When a later stage or the `onExecuteResults` callback throws after results are known, the SDK throws `PerpsExecutionError`. Its `response` holds the known results. An error with no known result stays the original error.
- `rethrowWithKnownResults(known, error)` is exported for provider implementations. It preserves the original error when no results are known and combines nested reports in execution order otherwise.
- Hyperliquid removes the local session-agent key after a `Submitted` or `Accepted` revoke; a refused or indeterminate revoke keeps it. Ondo evicts a rejected API key only for `Failed` with `refused: true`.
- An indeterminate result does not change to `ExchangeRejected`. `executeAction` is not retried.
