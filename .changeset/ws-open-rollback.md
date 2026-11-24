---
"@lifi/perps-sdk": minor
"@lifi/perps-sdk-provider-hyperliquid": patch
---

A WebSocket channel open that fails no longer leaves a wire subscription that each reconnect sends again.

- **perps-sdk**: add `WsProviderBase.openWires`. It registers the wire subscriptions of a channel and waits for the socket. If one of these steps fails, it runs the release of the channel and rethrows the error.
- **perps-sdk-provider-hyperliquid**: the `positions` and `accountSummary` channels, and the channels with one wire subscription, use `openWires`. Before this change, a failed `rws.ready()` kept the subscription and the `clearinghouseRefs` count, so the SDK never sent the unsubscribe frame.
