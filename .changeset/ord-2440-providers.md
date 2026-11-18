---
"@lifi/perps-sdk-provider-hyperliquid": patch
"@lifi/perps-sdk-provider-ondo": patch
---

Publish the Hyperliquid and Ondo providers against the `@lifi/perps-sdk` plugin contract that forwards caller params to `resolveActionRequest` and accepts a requested native IMF in `isLeverageEqual`. Both providers ignore the new arguments, so their behavior does not change.
