---
"@lifi/perps-sdk-provider-hyperliquid": patch
"@lifi/perps-types": patch
---

A Hyperliquid `Fill` does not set `type`, because a Hyperliquid fill row does not name the type of the originating order. A maker fill can come from a limit order or from a triggered limit order.
