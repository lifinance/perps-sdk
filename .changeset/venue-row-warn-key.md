---
"@lifi/perps-sdk": patch
---

`warnSkippedVenueRow`, `wsLog.skippedRow` and `wsLog.droppedRow` remember only the provider, row and field of a skipped row, not the venue value. Each warns once per provider, row and field, so a second bad value for the same field does not warn again.
