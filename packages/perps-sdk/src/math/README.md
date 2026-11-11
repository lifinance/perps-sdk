# `math/`

Trading formulas. Every formula takes and gives decimal strings, alone or in a `params` object. Arithmetic is exact `big.js`, with division to 40 decimal places, and no `Big` crosses the module boundary.

Each formula `X` throws `PerpsError(ValidationError)` on an input that does not match the decimal pattern, or on a degenerate input such as a zero divisor. The error message names the parameter. Each `X` has a `safeX` pair that logs a warning and gives `undefined`. A money-path caller uses `X`; a display caller uses `safeX`.

Some helpers read SDK structures instead:

- `estimateRealizedPnl(order, position)` takes an `Order` and a `Position`, and gives a decimal string, or `undefined` when the order does not reduce the position.
- `resolveMatchingPosition`, `calculateOrderbookWalk` and `buildQuote` take positions, book levels or a quote input.
- `estimateLiquidationPriceAtMarketRate(market, params)` takes a `PerpsMarket` and a `LiquidationEstimateParams`, and gives a decimal string. With `params.position`, it blends the order into that position, and reads `position.marginUsed` as the collateral without the unrealized PnL. It gives `undefined` when the market has no `maintenanceMarginRate`, when the order or the position is cross, when the order is against the side of the position, or when the position opens at or past liquidation.
- `isPositionMarginAdjustable` and `isPositionMarginRemovable` take a `Position` and give a `boolean`.
- `buildPosition(position)` takes a mapped `Position` and gives it with `positionValue`, `returnOnEquity`, `effectiveLeverage` and `liquidationDistance`. A venue `positionValue` or `returnOnEquity` stays. `returnOnEquity` comes from `calculateInitialMarginRoe`, and is absent when `unrealizedPnl` is not a decimal string or `size`, `entryPrice` or `leverage` is not above zero. Each other field comes from its formula, and is absent when an input is absent or not a decimal string, or when `markPrice`, `marginUsed` or `liquidationPrice` is not above zero. It always calculates `effectiveLeverage` and `liquidationDistance` again, and rounds them half-up to two decimal places for display. It never throws and never warns.
- `remarkPosition(position, markPrice)` gives a new `Position` with the mark-dependent fields calculated again through `buildPosition`. It keeps `marginUsed` and `initialMarginRequirement` from the input snapshot, so `effectiveLeverage` uses the margin of that snapshot. `returnOnEquity` uses the entry notional ÷ the leverage. It keeps the input `unrealizedPnl` when `entryPrice` is not a positive decimal string or `size` is not a decimal string. It gives the input when `markPrice` is not a positive decimal string, and never throws.
- `calculateAverageFillPrice(fills)` takes `Fill`s and gives the size-weighted average price, or `undefined` when the summed size is not above zero. It skips a fill whose `size` or `price` does not match the decimal pattern and never throws.
- `classifyFillFromPosition` takes decimal strings and gives a `FillClassification`. It gives `BUY` or `SELL` on a malformed decimal string and never throws.
- `calculateSlippagePrice(price, slippagePercent, isBuy)` is order-entry code. It does not round. Snap the result to the market tick before it goes to a venue.
