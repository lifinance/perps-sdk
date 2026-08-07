---
"@lifi/perps-sdk": minor
---

`getOrderbook` accepts an optional `priceStep` — the desired price-bucket size in quote units, forwarded to the backend so venues that cap their raw book at a few levels (Hyperliquid) can aggregate server-side.
