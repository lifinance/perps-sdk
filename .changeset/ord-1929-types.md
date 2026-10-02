---
"@lifi/perps-types": minor
---

Require `transferable` on every `spotBalances` frame row. The channel type is now `Balance & { locked: DecimalString; transferable: DecimalString }`, so a live spot frame carries the same released-units figure that a REST account snapshot carries.
