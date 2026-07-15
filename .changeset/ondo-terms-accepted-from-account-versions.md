---
"@lifi/perps-sdk-provider-ondo": patch
---

Derive Ondo `termsAccepted` from the `GET /v1/account` terms/privacy versions instead of the SIWE token's `newAccount` flag, so a future venue terms/privacy bump re-stages `ACCEPT_PROVIDER_TERMS`. Removes the now-unused `newAccount` token field and its post-agreement rewrite.
