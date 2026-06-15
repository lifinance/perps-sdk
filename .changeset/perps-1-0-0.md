---
"@lifi/perps-sdk": major
"@lifi/perps-sdk-provider-hyperliquid": major
"@lifi/perps-sdk-provider-lighter": major
"@lifi/perps-types": major
---

First stable release. The SDK is split into a `@lifi/perps-sdk` core plus per-DEX provider plugins (`@lifi/perps-sdk-provider-hyperliquid`, `@lifi/perps-sdk-provider-lighter`) and shared `@lifi/perps-types`. Markets are referenced by opaque `marketId` / `MarketRef` rather than display symbols.
