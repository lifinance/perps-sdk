---
'@lifi/perps-sdk': minor
---

Add `Big`-typed order-entry helpers `sizeFromMargin`, `marginFromSize`, `sizeFromNotional` and `marginFromNotional`. Each one divides at 40 decimal places and truncates, so a derived amount never exceeds the amount the user holds.
