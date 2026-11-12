---
"@lifi/perps-types": minor
"@lifi/perps-sdk-provider-ondo": minor
---

Add an optional `rebate` to `Fee`, and expose the Ondo fill rebate as `fee.rebate`. `fee.amount` stays the net amount charged. Ondo leaves out `fee` when `feeRebate` is negative.
