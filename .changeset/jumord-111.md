---
"@lifi/perps-sdk-provider-lighter": major
"@lifi/perps-types": minor
---

Lighter unified accounts now report the settlement asset (USDC on mainnet, USDG on the Robinhood deployment) as one `spot` balance row. Its `units` is the spot-route `balance` plus the perps-route `margin_balance`, and its `transferable` is the free spot route plus the perps route up to `available_balance`, floored at 0 and capped at `units`. In unified mode, `collateralBalances` has no settlement-asset row. Simple accounts keep the two separate rows.

`LighterAccountConfig` gains the required `collateralSpotBalance`, the spot-route `balance` of the collateral asset. The Lighter `getAccountSummary` adds it to `totalAssetValue` and skips every settlement row, so `portfolioValue` and `availableMargin` keep the same figures for both modes.

A Lighter `SEND_ASSET` (perps↔spot transfer on the same account) for a unified account now fails before it signs with the new `PerpsErrorCode.PooledCategoryTransfer` (2027).
