---
'@lifi/perps-sdk-provider-lighter': patch
'@lifi/perps-sdk': minor
---

Guard null wire lists in the Lighter provider, adopt the 2026-08-18 Lighter OpenAPI spec, and export a default market id per provider.

Lighter serializes an empty REST list as JSON `null`. Every list the provider reads is now typed `T[] | null` and normalized to an array at the response boundary, so an account with no trades, deposits, withdrawals, funding rows, liquidations, transfers, orders, positions, or assets returns an empty result instead of throwing.

The provider also sends the Lighter auth token in the `Authorization` header, drops the removed `market_id` wildcard from `/api/v1/positionFunding`, and no longer advertises the `1w` OHLCV interval that the spec removed.

`@lifi/perps-sdk` exports `DEFAULT_MARKET_ID` and `getDefaultMarketId` for the market a caller lands on when it names none.
