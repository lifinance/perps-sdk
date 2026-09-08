---
'@lifi/perps-sdk-provider-lighter': major
'@lifi/perps-sdk': minor
---

Guard null wire lists in the Lighter provider, adopt the 2026-08-18 Lighter OpenAPI spec, and export a default market id per provider.

Lighter serializes an empty REST list as JSON `null`. Every list the provider reads is now typed `T[] | null` and normalized to an array at the response boundary, so an account with no trades, deposits, withdrawals, funding rows, liquidations, transfers, orders, positions, or assets returns an empty result instead of throwing.

The provider also sends the Lighter auth token in the `Authorization` header, drops the removed `market_id` wildcard from `/api/v1/positionFunding`, and no longer advertises the `1w` OHLCV interval that the spec removed.

**Breaking:** `mapInterval('1w')` throws `PerpsError(ValidationError)` where it previously returned `'1w'`. Lighter's 2026-08-18 spec removed the weekly resolution, so a caller that charts weekly Lighter candles must pick `'1d'` or another supported interval.

**Breaking:** `LtDetailedAccount.positions`, `LtDetailedAccount.assets`, and `LtDetailedAccountsResponse.accounts` are typed `T[] | null`, which is the shape Lighter puts on the wire. A consumer that reads those fields off the raw wire type must handle `null`, or read the new `LtAccount` type, whose `positions` and `assets` are always arrays.

`@lifi/perps-sdk` exports `DEFAULT_MARKET_ID` and `getDefaultMarketId` for the market a caller lands on when it names none.
