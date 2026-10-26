---
"@lifi/perps-types": major
"@lifi/perps-sdk": major
---

`TriggerOrderInput` has a required `type` (`MARKET` or `LIMIT`), and `ModifyOrderInput` has an optional `type`. `limitPrice` is the price limit of the execution for both types. `slippagePercent` is removed from both inputs. `PerpsProviderPlugin` has an optional `triggerOrders` member with the TP/SL settings of the provider. Calculate the slippage-adjusted limit price of a market trigger leg with `calculateSlippagePrice` and `snapOrderPrice`.
