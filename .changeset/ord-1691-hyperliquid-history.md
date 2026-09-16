---
"@lifi/perps-sdk-provider-hyperliquid": patch
---

`getOrders` keeps the newest row of each order id in the `historicalOrders` feed. The feed lists one row per lifecycle transition, newest first, so an older `open` row no longer overwrites the terminal status of the same order and hides it from order history.
