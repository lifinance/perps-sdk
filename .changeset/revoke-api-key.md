---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-ondo": patch
"@lifi/perps-sdk-provider-lighter": patch
"@lifi/perps-sdk-provider-hyperliquid": patch
---

Add the API key revoke action.

- **perps-types**: add `ActionType.REVOKE_API_KEY`, which takes no params. It deletes the venue API keys that the SDK created (Extended first).
- **perps-sdk-provider-ondo**, **perps-sdk-provider-lighter**, **perps-sdk-provider-hyperliquid**: the account-config projection refuses `REVOKE_API_KEY` as a setup descriptor, like other actions that the venue does not use.
