# `math/`

Display tier. Inputs are `parseDecimal`ed numbers; outputs are for `format*`. Never send a result to a venue — use `wire/`.

The formulas take `number` amounts, alone or in a `params` object, and give a `number`, a `number | null`, or an object of `number`s. Exact decimal arithmetic happens internally with `DivBig`, and no `Big` crosses the module boundary.

Some helpers read SDK structures instead:

- `estimateRealizedPnl(order, position)` takes an `Order` and a `Position`.
- `findMatchingPosition`, `walkOrderbook` and `buildQuote` take positions, book levels or a quote input.
- `positionSupportsMarginAdjustment` and `positionSupportsMarginRemoval` take a `Position` and give a `boolean`.
- `classifyFill` and `classifyFillFromPosition` take `DecimalString`s and give a `FillClassification`.
