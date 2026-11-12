---
"@lifi/perps-types": minor
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

`Fill` has three optional fields for a closing fill: `closedSize`, `entryPrice` and `returnOnEquity`. Each provider sets them on `getFills` and on the `fills` stream. Lighter takes `realizedPnl` from the venue `ask_account_pnl` or `bid_account_pnl` when the trade row has it. `@lifi/perps-sdk` exports `buildFill` and `calculateFillClosedSize`.
