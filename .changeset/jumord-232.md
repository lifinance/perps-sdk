---
"@lifi/perps-sdk-provider-lighter": patch
---

A `deleverage` trade on the Lighter `trades` channel shows its execution price, `usd_amount` divided by `size`, in place of the zero `price` that Lighter sends. `LtWsTrade` declares the `type` and `usd_amount` fields of the venue frame.
