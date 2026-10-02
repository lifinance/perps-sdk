---
"@lifi/perps-sdk-provider-hyperliquid": major
"@lifi/perps-sdk-provider-lighter": major
"@lifi/perps-sdk-provider-ondo": major
---

Rename the plugin order-entry methods to match the `@lifi/perps-sdk` contract: `formatOrderSize` → `snapOrderSize(DecimalString)` and `formatOrderPrice` → `snapOrderPrice(DecimalString)`. Each one takes and gives a decimal string, so a 17-significant-digit size survives the call. The Hyperliquid package renames its exported `formatOrderSize(size, szDecimals)` and `formatOrderPrice(price, szDecimals, market)` helpers the same way. The grid rules are unchanged: sizes truncate toward zero onto the lot grid, prices round half-up onto the tick grid. The core SDK deletes `sizeFromMargin`, `marginFromSize`, `sizeFromNotional` and `marginFromNotional` in the same release.
