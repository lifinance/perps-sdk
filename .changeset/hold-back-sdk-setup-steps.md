---
"@lifi/perps-sdk": minor
---

Add `selectUserSetupActions`, which filters a provider's `setup` descriptors to those a user must satisfy (their `signers` include `USER`). Steps the SDK signs on its own are held back so onboarding lists render one card per user action instead of inert placeholders for steps `checkSetup` completes inline.
