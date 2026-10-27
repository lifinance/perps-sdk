---
"@lifi/perps-sdk-provider-hyperliquid": patch
---

An unknown Hyperliquid order status that ends with `Canceled` or `Rejected` maps to `CANCELLED` or `REJECTED` with a generic `statusReason`. The provider keeps the order row and does not drop it.
