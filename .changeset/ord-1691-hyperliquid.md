---
"@lifi/perps-sdk-provider-hyperliquid": patch
---

Map the `LiquidationMarket` time-in-force to `TimeInForce.IOC`. `getOrders` now drops an order row it cannot map, warns once per message, and returns the rest of the page. `getActivity` reads `userFills` and emits a `LiquidationActivity` for each liquidation order of the queried account, and skips fills whose hash a ledger liquidation row already carries.
