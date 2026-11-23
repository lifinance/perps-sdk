# `math/`

Trading formulas. Every formula takes and gives decimal strings, alone or in a `params` object. Arithmetic is exact `big.js`, with division to 40 decimal places, and no `Big` crosses the module boundary.

Each formula `X` throws `PerpsError(ValidationError)` on an input that does not match the decimal pattern, or on a degenerate input such as a zero divisor. The error message names the parameter. Each `X` has a `safeX` pair that logs a warning and gives `undefined`. A money-path caller uses `X`; a display caller uses `safeX`.

`Position.returnOnEquity` is unrounded. Venue ROE keeps the converted source precision.
Calculated ROE keeps the decimal helper precision. Consumers choose the display precision.

Some helpers read SDK structures instead:

- `estimateRealizedPnl(order, position)` takes an `Order` and a `Position`, and gives a decimal string, or `undefined` when the order does not reduce the position.
- `resolveMatchingPosition`, `calculateOrderbookWalk` and `buildQuote` take positions, book levels or a quote input.
- `estimateLiquidationPriceAtMarketRate(market, params)` takes a `PerpsMarket` and a `LiquidationEstimateParams`, and gives a decimal string. With `params.position`, it blends the order into that position, and reads `position.marginUsed` as the collateral without the unrealized PnL. It gives `undefined` when the market has no `maintenanceMarginRate`, when the order or the position is cross, when the order is against the side of the position, or when the position opens at or past liquidation.
- `isPositionMarginAdjustable` and `isPositionMarginRemovable` take a `Position` and give a `boolean`.
- `buildPosition(position)` completes `positionValue`, `effectiveLeverage`, and `liquidationDistance`. It retains explicit venue values and ROE, but does not calculate missing `returnOnEquity`. Provider plugins own `calculateRoe(position)`. Effective leverage and liquidation distance use half-up rounding to two decimal places. Unusable inputs leave calculated fields absent. The helper never throws or warns.
- `remarkPositionValues(position, markPrice)` recalculates provider-independent mark fields and clears stale ROE. It retains snapshot `marginUsed` and `initialMarginRequirement`. Invalid entry prices or sizes retain the input PnL. Invalid marks return the input unchanged. Consumers call `provider.remarkPosition` to include the provider's ROE calculation.
- `calculateAverageFillPrice(fills)` takes `Fill`s and gives the size-weighted average price, or `undefined` when the summed size is not above zero. It skips a fill whose `size` or `price` does not match the decimal pattern and never throws.
- `calculateFillClosedSize(fill)` takes the `size`, `startPosition` and `classification` of a `Fill`, and gives the part of the fill that reduced the position before it: `min(|startPosition|, size)`. Without `startPosition`, it gives `size` for a reducing or closing fill. It gives `undefined` for a fill that opens or increases a position, a spot fill, a flip without `startPosition`, a `startPosition` of zero, or a malformed input, and never throws.
- `buildFill(fill, leverage)` takes a mapped `Fill` and gives it with `closedSize`, `entryPrice` and `returnOnEquity`. A positive input `entryPrice` stays. Otherwise the entry price comes from `realizedPnl`, `closedSize` and `price`. `returnOnEquity` comes from `calculateInitialMarginRoe` with `leverage`, and a `null` `realizedPnl` counts as zero. A field is absent when one of its inputs is absent or not usable. It never throws and never warns.
- `classifyFillFromPosition` takes decimal strings and gives a `FillClassification`. It gives `BUY` or `SELL` on a malformed decimal string and never throws.
- `calculateSlippagePrice(price, slippagePercent, isBuy)` is order-entry code. It does not round. Snap the result to the market tick before it goes to a venue.
- `annualizeFundingRate(rate, ratePeriodSeconds)` takes the rate period as a `number` of seconds, from `Provider.funding.ratePeriodSeconds`. It gives the simple APR as a decimal fraction and keeps the sign. It does not compound. It throws when `ratePeriodSeconds` is not a finite number above zero.
