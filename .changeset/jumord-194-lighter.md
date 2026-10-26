---
"@lifi/perps-sdk-provider-lighter": minor
---

The Lighter providers set `triggerOrders`: a modify cannot change the order type, and the market TP/SL slippage input goes from 1% to 10% in steps of 0.01%, with a default of 1%. `slippageAdjustedLimitPrice` gives the limit price of a market trigger order. Order reads set `limitPrice` from the venue `price` on all four trigger types.
