---
"@lifi/perps-sdk": patch
---

expose marginMode on PlaceOrderParams — the backends already apply it (Lighter on the order tx, Hyperliquid via the prepended leverage update), but the client type never carried it, so orders silently fell to the cross default
