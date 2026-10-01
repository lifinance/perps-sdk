---
'@lifi/perps-sdk-provider-lighter': patch
---

Preserve signed cross free collateral when calculating per-market trading capacity so undercollateralized accounts do not overstate capacity after closing a position. Account summary available margin remains nonnegative.
