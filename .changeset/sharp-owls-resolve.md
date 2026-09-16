---
"@lifi/perps-types": major
"@lifi/perps-sdk": major
"@lifi/perps-sdk-provider-hyperliquid": major
---

Remove `Asset.wireId` and the asset registry's `wireId` index. A Hyperliquid ledger row carries the bare spot token symbol, not a `NAME:tokenId` pair, so the mapper resolves the symbol in the spot asset registry. `AssetRegistry.get` and `AssetRegistry.require` accept `'id'` and `'l1Address'` only.
