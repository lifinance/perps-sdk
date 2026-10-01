---
'@lifi/perps-sdk-provider-hyperliquid': minor
---

Paginate retained Hyperliquid fills, funding, ledger events and liquidations beyond upstream response caps without losing equal-time activities. Return deterministic newest-first pages and opaque cursors, preserving liquidation order aggregation and inclusive time bounds. Venue retention still limits fills to the latest 10,000; unpageable saturated timestamps fail explicitly instead of silently truncating history.

Migration: malformed cursors and older timestamp or `time:trade-id` cursors are rejected with `PerpsErrorCode.ValidationError`. Callers must discard stored older cursors and restart traversals without a cursor; the provider does not restart automatically.

Reject page limits that are not positive safe integers with `PerpsErrorCode.ValidationError`, preventing non-advancing pages and uncapped history reads. Valid limits still default to 50 and cap at 200.
