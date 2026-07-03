---
'@lifi/perps-sdk-provider-ondo': minor
---

Add the Ondo realtime WS provider: `ondoWsProvider()` subscribes to Ondo's WebSocket channels — orderbook (`depthBooksPerps`), trades, klines (with SDK-interval → Ondo-resolution mapping), and market context merged from `markPricesPerps` + `fundingRatesPerps` — plus the JWT-authenticated `ordersPerps`/`fillsPerps`/`positionsPerps` streams. The stored SIWE session JWT is sent as a single `login` op per connection before the first private subscribe (re-sent after reconnects); a missing or expired session surfaces as `OndoSessionExpiredError` instead of hanging. `spotBalances` is rejected — Ondo exposes no spot balances channel.
