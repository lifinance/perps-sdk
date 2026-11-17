## Throwing and Safe Functions

A function that can fail has two forms:

- `X` throws a `PerpsError`.
- `safeX` gives `undefined` and logs a warning. Make `safeX` with `createSafeFunction` from `packages/perps-sdk/src/utils/createSafeFunction.ts`.

Use these rules for the two forms:

- Do not add a default parameter to `safeX`. The caller writes `?? fallback`.
- Add a `safeX` only for a function that can fail.
- Each `safeX` must have its throwing twin `X`.

## Money Path and Display Path

The use of a value decides which form to call.

- On the money path, call `X`. If `X` throws, show the `ValidationError` to the user. Never use `0` or a default value.
- On the display path, call `safeX`. If `safeX` gives `undefined`, show a placeholder and keep the row.
- Skip a row only when an identity field (`id` or market) is missing.
- Do not let one bad row remove the full list.
- Show a value from a provider as the provider sends it. Do not parse it or format it.

## Decimal Values

- Do all arithmetic with the helpers in `packages/perps-sdk/src/decimal/`, for example `multiplyDecimalString`.
- Do not call `Big` outside `decimal/`. A `Big` value must never cross the public boundary.
- Use `decimalStringToNumber` only for a chart value or a pixel value. This conversion loses precision.
- Do not use `Decimal` alone as a name prefix.
