---
"@lifi/perps-sdk": patch
---

`checkSetup` stages the setup of a provider that declares a `CREATE_ACCOUNT` step even when `accountExists` reports `false`, as it does for SIWE providers. Such a provider (Extended) opens the account during setup, before any deposit, so the deposit-first gate would leave a new user with no way to create the account.
