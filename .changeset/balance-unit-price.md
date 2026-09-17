---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Add the optional `price` field to `Balance`. It is the USD price of one unit, as a decimal string. A consumer renders an asset price with no market lookup and no math. The field is absent when the provider holds no price for the asset.

Hyperliquid fills `price` on every spot balance from the same spot price map that already makes `valueUsd`, on both the REST account read and the `spotBalances` WebSocket channel. A quote token gets `1`. A token with no spot market stays unpriced. Lighter and Ondo fill `price` with `1` on the settlement asset. Lighter leaves its other spot tokens unpriced.
