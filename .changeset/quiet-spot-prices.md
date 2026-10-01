---
'@lifi/perps-sdk-provider-hyperliquid': patch
---

Keep Hyperliquid spot balance and spot-funded account summary price feeds subscribed independently of market consumers. Revalue stored balances on price updates and wait for listed held assets to receive prices before emitting portfolio values.

Roll back spot and price subscriptions when portfolio feed acquisition fails, and allow summary resubscriptions to recover without retaining ownerless wires.
