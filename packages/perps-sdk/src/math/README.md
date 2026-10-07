# `math/`

Trading formulas. Every formula takes and gives decimal strings, alone or in a `params` object. Arithmetic is exact `big.js`, with division to 40 decimal places, and no `Big` crosses the module boundary.

Each formula `X` throws `PerpsError(ValidationError)` on an input that does not match the decimal pattern, or on a degenerate input such as a zero divisor. The error message names the parameter. Each `X` has a `safeX` pair that logs a warning and gives `undefined`. A money-path caller uses `X`; a display caller uses `safeX`.

Some helpers read SDK structures instead:

- `estimateRealizedPnl(order, position)` takes an `Order` and a `Position`, and gives a decimal string, or `undefined` when the order does not reduce the position.
- `findMatchingPosition`, `walkOrderbook` and `buildQuote` take positions, book levels or a quote input.
- `estimateLiquidationPriceAtMarketRate(market, params)` takes a `PerpsMarket` and the entry, leverage and side, and gives a decimal string, or `undefined` when the market has no `maintenanceMarginRate`.
- `positionSupportsMarginAdjustment` and `positionSupportsMarginRemoval` take a `Position` and give a `boolean`.
- `classifyFill` and `classifyFillFromPosition` take decimal strings and give a `FillClassification`. Each gives `BUY` or `SELL` on a malformed decimal string and never throws.
- `applySlippageToPrice(price, slippagePercent, isBuy)` is order-entry code. It does not round. Snap the result to the market tick before it goes to a venue.
