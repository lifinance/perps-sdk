---
'@lifi/perps-sdk-provider-lighter': patch
---

Map Lighter's numeric perp market-stats fields to the decimal strings that `MarketContext` declares. The `market_stats` channel sends `daily_price_change`, `daily_quote_token_volume`, and `daily_base_token_volume` as JSON numbers, and the perp branch of `mapMarketContext` passed the raw numbers into the string-typed `priceChange24h` and `volume24h` fields. The spot branch already converts the same fields. `LtWsMarketStats` now declares the three fields as `number`, which matches the live wire shape and the existing `LtWsSpotMarketStats` declaration.
