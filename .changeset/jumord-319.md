---
"@lifi/perps-types": minor
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

`Fill` has three optional fields for a closing fill: `closedSize`, `entryPrice` and `returnOnEquity`. Each provider sets them on `getFills` and on the `fills` stream. Lighter takes `realizedPnl` from the venue `ask_account_pnl` or `bid_account_pnl` when the trade row has it. On the `fills` stream, a frame waits for a maximum of `WS_FRAME_ENRICHMENT_TIMEOUT_MS` for its leverage read, and then emits without `returnOnEquity`. `@lifi/perps-sdk` exports `buildFill`, `calculateFillClosedSize` and `WS_FRAME_ENRICHMENT_TIMEOUT_MS`.
