---
'@lifi/perps-types': minor
'@lifi/perps-sdk': minor
'@lifi/perps-sdk-provider-hyperliquid': minor
'@lifi/perps-sdk-provider-lighter': minor
'@lifi/perps-sdk-provider-ondo': minor
---

Add the optional `getPortfolioHistory` provider read and `PerpsClient.getPortfolioHistory`. The method returns the account value and the cumulative PnL over a `24h`, `7d`, `30d`, or `all` window. `@lifi/perps-types` exports `PortfolioHistoryRange`, `PortfolioHistoryPoint`, and `PortfolioHistoryResponse`. The Hyperliquid, Ondo, and Lighter providers implement the read.
