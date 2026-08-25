---
'@lifi/perps-types': major
'@lifi/perps-sdk': major
'@lifi/perps-sdk-provider-hyperliquid': major
'@lifi/perps-sdk-provider-lighter': minor
'@lifi/perps-sdk-provider-ondo': minor
---

Carry accrued funding on `Position`.

`Position` gains a required `accruedFunding` string. It reports the funding the
position accrued since it opened, in quote-currency units. A positive value means
the account received funding. A negative value means the account paid it. Every
venue resets the value when the position returns to flat.

`HlPosition` gains a required `cumFunding` object, which the Hyperliquid
`clearinghouseState` and `webData2` payloads always send. Hyperliquid signs
`cumFunding` as funding paid, so the Hyperliquid mapper negates
`cumFunding.sinceOpen`. Lighter `total_funding_paid_out` and Ondo
`netFundingSinceNeutral` already use the account point of view, so those mappers
pass the value through.
