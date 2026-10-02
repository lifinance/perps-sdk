# `math/`

Display tier. Inputs are `parseDecimal`ed numbers; outputs are for `format*`. Never send a result to a venue — use `wire/`.

Every formula takes and gives `number`. Exact decimal arithmetic happens internally with `DivBig`, and no `Big` crosses the module boundary.
