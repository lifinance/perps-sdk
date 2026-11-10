<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-types/latest.svg)](https://www.npmjs.com/package/@lifi/perps-types)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-types.svg)](https://www.npmjs.com/package/@lifi/perps-types)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-types</code></h1>

Shared, zero-dependency types for the [LI.FI Perps SDK](https://www.npmjs.com/package/@lifi/perps-sdk) and its provider plugins. You rarely install it directly — it arrives transitively with `@lifi/perps-sdk`, which re-exports every type.

## Installation

```bash
pnpm add @lifi/perps-types
```

## Internal transfers

`ActivityItem` includes `InternalTransferActivity` with `type: ActivityType.INTERNAL_TRANSFER`.
It requires `asset`, the unchanged venue `amount` as a `DecimalString`, `sourceBalance`, and `destinationBalance`.
`InternalTransferBalance` is `'spot' | 'perps' | 'staking' | 'borrowLend'`.
These values identify balances within the queried account at one provider, not `ProviderCategory.id` values.
The interface permits `meta` and `explorerLink`. It has no direction, counterparty, or fee field.

The balance pair determines direction, not the amount sign.
An internal transfer is not an external deposit, withdrawal, income, or trading profit.
A borrow or repayment also affects a liability. Consumers must preserve and inspect the operation metadata.

`TransferActivity` still requires a counterparty and describes movements between distinct accounts.
Hyperliquid staking and borrow-lend rows use `INTERNAL_TRANSFER`, not `TRANSFER`.
Add `INTERNAL_TRANSFER` to activity filters and handle its union member explicitly.
Use `[ActivityType.TRANSFER, ActivityType.INTERNAL_TRANSFER]` to request both types.
An omitted filter includes both types.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
