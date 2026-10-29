---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-hyperliquid": major
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Orders and fills keep venue liquidation data: `RegularOrder.isLiquidation` marks a venue liquidation order, and `Fill.liquidation` gives the `LiquidationMethod` and mark price on the fill of the liquidated account only. Hyperliquid `mapFill` now takes the account address as its third argument.
