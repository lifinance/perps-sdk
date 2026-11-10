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

## Fee and reward activities

`ActivityItem` includes `FeeActivity` (`ActivityType.FEE`) and `RewardActivity`
(`ActivityType.REWARD`). Both extend `BaseActivity` and carry a resolved
`asset: Asset` and `amount: DecimalString`. Both permit `meta` and `explorerLink`.
Neither requires a direction, counterparty, or market.

`FEE` identifies a standalone charge. `REWARD` identifies income. The amount
uses the asset's units and retains the venue decimal string, including its
precision. Providers do not negate, round, or convert the amount to a number.
Fees embedded in trades, transfers, and withdrawals keep their existing fields.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
