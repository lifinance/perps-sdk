---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-ondo': major
---

`ActionResult` is one flat type. Remove the `refused` field. A `Failed` result means the venue refused the action. Add `isSubmittedOrAccepted` and `CHECK_ACCOUNT_BEFORE_RETRY_TEXT`. Every `Indeterminate` error ends with that advice.
