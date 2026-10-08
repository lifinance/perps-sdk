---
"@lifi/perps-sdk": patch
"@lifi/perps-sdk-provider-hyperliquid": patch
---

`estimateLiquidationPrice`, `estimateLiquidationPriceAtMarketRate` and the Hyperliquid `calculateLiquidationPrice` return `undefined` when `1 / leverage` is at or below the maintenance margin rate, instead of a liquidation price on the wrong side of entry.
