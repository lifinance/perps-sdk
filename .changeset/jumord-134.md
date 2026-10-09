---
"@lifi/perps-sdk-provider-hyperliquid": patch
---

Hyperliquid spot balances from `getAccount` and the `spotBalances` WebSocket channel now carry the `decimals` of the registry asset with the same `id`.
