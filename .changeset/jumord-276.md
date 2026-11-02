---
"@lifi/perps-types": major
"@lifi/perps-sdk": major
"@lifi/perps-sdk-provider-hyperliquid": major
"@lifi/perps-sdk-provider-lighter": major
"@lifi/perps-sdk-provider-ondo": minor
---

`MarketContext` has a required `provider` field, because a `marketId` is unique only within one provider. The Hyperliquid, Lighter, and Ondo WS providers set `provider` to the provider key of the instance on each `marketsContext` and `marketContext` emit. The `mapMarketContext` functions of the Hyperliquid and Lighter providers take the provider key as their first argument.
