---
'@lifi/perps-types': minor
'@lifi/perps-sdk': minor
---

- `@lifi/perps-types`: `SetupOption.description?: string` is new. It carries option-specific prose that a UI shows beside the option in its selector. `SetupAction.description` stays the general prose for the whole choice.
- `@lifi/perps-sdk`: `PerpsClient.executeProviderRevoke` now rejects with `PerpsErrorCode.SDKError` when `createAction` stages nothing to revoke, where it used to resolve silently.
