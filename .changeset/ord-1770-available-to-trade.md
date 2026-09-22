---
'@lifi/perps-sdk-provider-hyperliquid': minor
'@lifi/perps-types': minor
'@lifi/perps-sdk': minor
'@lifi/perps-sdk-provider-lighter': patch
'@lifi/perps-sdk-provider-ondo': patch
---

Add a per-market available-to-trade read. `PerpsClient.getAvailableToTrade` reports the amounts an account can still buy and sell on one market, in that market's margin asset. The Hyperliquid provider reads the figure from `activeAssetData` and streams it on the new `availableToTrade` WebSocket channel. Every other provider falls back to the account summary `availableMargin`. The Lighter and Ondo WebSocket providers reject the new channel, which they do not stream.
