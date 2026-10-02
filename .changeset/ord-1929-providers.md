---
"@lifi/perps-sdk-provider-hyperliquid": minor
"@lifi/perps-sdk-provider-lighter": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Set `max` on every `getWithdrawableBalances` row with the shared `calculateWithdrawMax`, and clamp every `Balance.transferable` with the shared `calculateTransferable` instead of a local `minOf(maxOf(...))` copy. Hyperliquid spot balances now spell their unit price and USD value in plain decimal notation, so a mark below `1e-6` no longer reaches a consumer as `5e-7`; Lighter market contexts do the same for `priceChange24h` and `volume24h`.
