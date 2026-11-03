---
"@lifi/perps-sdk": major
"@lifi/perps-sdk-provider-hyperliquid": major
"@lifi/perps-sdk-provider-lighter": major
"@lifi/perps-sdk-provider-ondo": major
---

`viem` is now a required peer dependency, limited to `>=2.57.11 <2.57.12`. Install `viem@2.57.11` in your app. `viem` 2.57.12 and later reject the Hyperliquid `HyperliquidTransaction:*` EIP-712 type names, so user-signed Hyperliquid actions fail before the wallet signs.
