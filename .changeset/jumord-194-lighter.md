---
"@lifi/perps-sdk-provider-lighter": minor
---

The Lighter providers set `triggerOrders`: a modify cannot change the order type, and the market TP/SL slippage input goes from 1% to 10% in steps of 0.01%, with a default of 1%. `LIGHTER_MARKET_SLIPPAGE_PERCENT` holds these values. Order reads set `limitPrice` from the venue `price` on all four trigger types.
