---
"@lifi/perps-sdk": minor
---

`formatCompactUsd` accepts two new options, `significantDigits` and `compactFrom`. For example, `formatCompactUsd(84559.55, { rounding: 'floor', significantDigits: 3, compactFrom: '10000' })` gives `$84.5K`, and a value below `compactFrom` shows in full. `significantDigits` applies to the full compact number, so one digit with `rounding: 'floor'` changes 84,559 to `$80K`.

Changes to the current output:

- `formatCompactUsd` now uses the `rounding` option. With `rounding: 'floor'`, 84,559.55 gives `$84.55K`, not `$84.56K`.
- A value below 1000 renders the same as with `formatUsd`. It uses the locale decimal separator, and a value that rounds to zero shows no `-` sign.
- The compact number also uses the locale. With `de-DE`, 84,559.55 gives `$84,56K`. A compact number of 1000 or more in the billions tier has grouping, for example `$1,234.00B`.
- The suffix is chosen after the rounding. 999,999.999 gives `$1.00M`, not `$1000.00K`.
