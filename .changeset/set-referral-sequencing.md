---
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": patch
"@lifi/perps-sdk-provider-lighter": patch
---

Sequence-gate the internal setup drain and return a renderable setup checklist.

`checkSetup` now defers an internal (SDK-signed) setup step while a staged user-facing step with a lower `sequence` is outstanding, so Lighter `SET_REFERRAL` no longer fires before `REGISTER_API_KEY`. The Lighter `referral/use` flow now reads the account's applied code first and skips the POST when it already equals the target code; a foreign code is still overwritten. `ProviderSetup` gains `checklist`: every USER-signed setup descriptor with its satisfied state, ordered by `sequence`, with conditional steps (declared via the new `PerpsProviderPlugin.conditionalSetupActions`) omitted when the account does not need them — so a consumer renders the onboarding list from `checkSetup` output alone, and a never-needed Hyperliquid `REVOKE_AGENT` never shows as satisfied.
