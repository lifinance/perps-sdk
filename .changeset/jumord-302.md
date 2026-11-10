---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Add optional order outcomes and fee rebates, and expose Ondo order PnL, net fees, and rebates on orders and fills. Ondo leaves out `fee` when `feeRebate` is negative, and warns once for a malformed order `realizedPnl`.
