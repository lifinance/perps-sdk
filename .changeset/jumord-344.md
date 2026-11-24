---
"@lifi/perps-sdk": patch
---

`calculateOrderAmounts` rounds a derived margin up at 40 decimal places, so a caller that holds this margin gets the same order size.
