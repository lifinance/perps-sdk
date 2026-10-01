---
'@lifi/perps-sdk-provider-hyperliquid': minor
---

Paginate retained Hyperliquid fills, funding, ledger events and liquidations beyond upstream response caps without losing equal-time activities. Return deterministic newest-first pages and opaque cursors, preserving liquidation order aggregation and inclusive time bounds. Restart traversals that persisted older timestamp cursors. Venue retention still limits fills to the latest 10,000; unpageable saturated timestamps fail explicitly instead of silently truncating history.
