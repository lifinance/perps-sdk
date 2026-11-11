---
"@lifi/perps-sdk": patch
"@lifi/perps-types": patch
"@lifi/perps-sdk-provider-hyperliquid": minor
---

`Position.returnOnEquity` uses the entry notional ÷ the current leverage: `unrealizedPnl ÷ (|size| × entryPrice ÷ leverage) × 100`. `buildPosition` and `remarkPosition` calculate it with `calculateInitialMarginRoe`, so margin that the user adds to an isolated position does not change it. The Hyperliquid mapper passes the venue `returnOnEquity` as a percent, and `HlPosition` declares it. Hyperliquid and Ondo use the same formula for their venue figure.
