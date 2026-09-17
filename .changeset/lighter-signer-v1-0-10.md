---
"@lifi/perps-sdk-provider-lighter": minor
---

Rebuild the vendored Lighter WASM signer from lighter-go `v1.0.10`.

Lighter now assigns market IDs from a 64-bit sequence that starts at 4095. The previous signer rejected any market index above 254 for perps and outside `[2048, 4094]` for spot, so it refused to sign an order on a new market. The new signer accepts any index from 0 to 32767, except the reserved value 255. The signed `MarketIndex` field stays 16-bit.

The signer no longer checks the market type of a transaction. A market ID no longer tells the signer whether the market is perps or spot, so the caller must apply the perps-only rules for reduce-only orders and for stop-loss and take-profit legs.

`SignModifyOrder` takes an order-version argument. The SDK supplies the nil value, which keeps the wire attributes unchanged.
