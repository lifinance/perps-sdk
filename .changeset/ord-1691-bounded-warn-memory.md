---
'@lifi/perps-sdk': patch
'@lifi/perps-sdk-provider-hyperliquid': patch
---

Bound the key memory that suppresses repeat warnings. The market registry and the Hyperliquid order reads each held every unresolved id they had ever seen, and venue wire data supplies those ids, so the memory grew for as long as the process ran. Each warner now remembers 256 keys and forgets the oldest one first.

The `createWarnOnce` helper is exported from `@lifi/perps-sdk`.
