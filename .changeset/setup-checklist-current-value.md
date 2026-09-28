---
'@lifi/perps-sdk': minor
'@lifi/perps-sdk-provider-lighter': patch
---

- `@lifi/perps-sdk`: `SetupChecklistItem.currentValue: string | null` is new. For a choice step it is the account's current value as the venue names it, even when no option binds that value, for example `standard` or `dexAbstraction`. It is `null` when the venue reports no value, and always `null` for a non-choice step.
- `@lifi/perps-sdk-provider-lighter`: the `ACCOUNT_TYPE` projection now carries the raw tier name that `/accountLimits` reports, even when no option binds it. A tier no option binds still reads unsatisfied.
