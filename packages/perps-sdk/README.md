<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk</code></h1>

Core of the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/) — a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface.

- **Unified API** across perpetual DEXes (Hyperliquid, Lighter, Ondo).
- **Provider plugins** — each DEX ships as a separate package you register on the client.
- **Agent-based signing** — trades execute without per-order wallet popups (one-time wallet signature during setup).
- **Two layers** — low-level service functions and the high-level `PerpsClient`.
- **Streaming** — WebSocket subscriptions for prices, orderbook, and fills.
- **Fully typed** — all types exported, sourced from `@lifi/perps-types`.

## Installation

Install the core SDK plus the provider plugin(s) for the DEX(es) you target:

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

| Package | Install for |
| --- | --- |
| `@lifi/perps-sdk` | every project |
| [`@lifi/perps-sdk-provider-hyperliquid`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid) | Hyperliquid |
| [`@lifi/perps-sdk-provider-lighter`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter) | Lighter |
| [`@lifi/perps-sdk-provider-ondo`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo) | Ondo |

`apiKey` is optional. The default host `https://li.quest/v1/perps` accepts
anonymous requests. The `develop.li.quest` and `staging.li.quest` hosts require
a key. Get a key from the [LI.FI Partner Portal](https://portal.li.fi/); it
identifies your integration to the backend. `integrator` is optional too: the
SDK sends it as an assertion only when your `apiKey` is non-empty.

## Quick start

Create a client, register the providers you installed, and call the service functions:

```ts
import { createPerpsClient, getMarkets } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = createPerpsClient({
  providers: [hyperliquidProvider()],
})

const { markets } = await getMarkets(client, { provider: 'hyperliquid' })
```

Pass your key when you have one, or when you target `develop.li.quest` or
`staging.li.quest`:

```ts
const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})
```

## Reference registry caching

Asset and market registries are scoped to each SDK client and provider. In Node,
the default HTTP transport reuses the indexed snapshot while the response's
explicit `Cache-Control: max-age` remains fresh. `Age`, `Date`, and request
duration reduce the remaining lifetime; cache hits never extend it. Backend URL
and SDK credential changes invalidate reuse.

Missing or invalid freshness metadata, `no-store`, `no-cache`, and `Vary: *`
cause another HTTP request. There is no guessed TTL or stale-on-error fallback:
an expired refresh failure rejects `sync()`, leaving the last successful snapshot
available only for existing index lookups. Concurrent requests with the same
identity share a refresh.

Browsers continue to use their native HTTP cache. A `requestInterceptor` or
custom `fetch` can change credentials, headers, or cache policy on every call,
so either disables registry-level reuse and request coalescing. Such hooks still
run on every `sync()`. This cache applies only to reference registries, not account,
price, or authenticated trading responses.

## High-level client

`PerpsClient` owns the end-to-end action pipeline. Its trade wrappers include
`placeOrder()`, `placeTriggerOrder()`, `placeTwapOrder()`, `cancelOrders()`,
`cancelTwapOrder()`, and `modifyOrders()`.

Account-specific reads go directly to the venue. `getOrders()` returns the
`Order` union with regular, trigger, and TWAP rows. Its default filter includes
PENDING, OPEN, PARTIALLY_FILLED, and TRIGGERED. Use `statuses` to read history.

`getWithdrawableBalances()` returns the `(asset, route)` pairs an address can
withdraw at the venue. Hyperliquid, Lighter, and Ondo implement it. The client
joins each row onto the registry `Asset` and drops a row below the per-asset
venue minimum. A row carries `withdrawalFee`, in the asset's own units, when a
fee source is known for that asset:

- Hyperliquid: the backend `/providers` `withdrawalFeeUsd`, on USDC rows only.
  This read also calls the backend. A missing descriptor value leaves the key
  absent. `isFeeDeducted` is `true`.
- Ondo: the account's `/v1/account` `withdrawalFeeUSD`, on the collateral row.
  The USD fee counts 1:1 as collateral units, because Ondo collateral is USDC.
  `isFeeDeducted` is `false`.
- Lighter: never set.

Every row carries `max`: the largest `amount` the row can fund. A row with a
fee can also carry `isFeeDeducted`. With `true`, the venue takes the fee out
of the requested amount, so an amount at or below the fee delivers nothing,
and `max` equals `available`. With `false`, the venue charges the fee in
addition to the requested amount, so `max` is `available` minus the fee,
floored at zero. A `max` of zero funds no withdrawal. An absent
`isFeeDeducted` means unknown. It does not mean `true`.

An absent `withdrawalFee` means that no fee source is known. It does not prove
that the venue charges no fee. `max` then equals `available`.

```ts
import { PerpsClient, isTwapOrder } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = new PerpsClient({
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})

const { orders } = await client.getOrders({
  provider: 'hyperliquid',
  address: '0xUser',
  marketId: 'ETH',
})
const runningTwaps = orders.filter(isTwapOrder)
```

### Available balance reads

`getAccountSummary()` rolls an account snapshot up into an `AccountSummary`.
Its `availableMargin` is account-scoped. `getAvailableToTrade()` reads the
per-market figure for one market, as separate `buy` and `sell` amounts in the
market's margin asset. The order panel reads the per-market figure, and account
displays read the account-scoped figure.

Some providers answer it directly. Hyperliquid reads it from
`activeAssetData`, and also streams it on the `availableToTrade` WebSocket
channel. Ondo reads it from `/v1/perps/max_order_size` over REST only, and
needs a session. Lighter publishes no per-market figure, so the Lighter
provider calculates it over REST only, from `availableMargin` and the open
position on each perps market. The side that adds to the position gets
`availableMargin`. The side that reduces or flips the position gets the
initial margin requirement of the position, plus `availableMargin` and the
margin that the close releases. Without an Ondo session, for Lighter spot
markets, and for every other provider, the client falls back to the account
summary, so `buy` and `sell` both equal `availableMargin`.

Each collateral row in `Account.collateralBalances` and each spot row carries
`transferable`: the part of `units` that the venue releases from that category.
The value is always from `0` to `units`. No WebSocket channel updates it. It is
not the withdrawal ceiling: read `getWithdrawableBalances` for that.

- Hyperliquid: the sub-dex `clearinghouseState.withdrawable`, one row per
  sub-dex.
- Lighter: the account's `available_balance` on the settlement-asset row, and
  `0` on every other asset's row, since a category transfer moves only the
  settlement asset.
- Ondo: the `/v1/perps/balance` `withdrawableMargin`.
- Hyperliquid spot rows: the `spotClearinghouseState` `total` minus `hold`.
- Lighter spot rows: the asset `balance` minus `locked_balance`.
- Lighter unified accounts: the settlement asset is one spot row and has no
  collateral row. Its `units` is `balance` plus `margin_balance`. Its
  `transferable` is `balance` minus `locked_balance`, plus `margin_balance` up
  to `available_balance`. A `sendAsset` for a unified account fails with
  `PooledCategoryTransfer`.

`PerpsWsClient.streamsAvailableToTrade(provider)` tells a caller, before the
first subscribe, whether the provider streams the `availableToTrade` channel.
Hyperliquid streams it for perps markets only, and rejects a spot-market
subscription with a `ValidationError`.

```ts
const availableToTrade = await client.getAvailableToTrade({
  provider: 'hyperliquid',
  address: '0xUser',
  marketId: 'ETH',
})
console.log(availableToTrade.buy, availableToTrade.sell)
```

### Order amounts and venue grids

Order amounts cross the API as a `DecimalString`: a plain decimal string with
no grouping, exponent or currency sign. Never convert one to a `number`. A
`number` holds 15 significant digits, so `Number('1234567.0000000001')` is
`1234567` and the order loses a lot step before it reaches the venue.

`snapOrderSize(sdk, market, size)` snaps a size onto the venue lot grid of the
market's own provider. It truncates toward zero, so the snapped size never
exceeds the size the user asked for. `snapOrderPrice(sdk, market, price)`
snaps a price onto the venue tick grid and rounds half-up. Each one resolves
the provider from `market.providerId`, so a caller never applies one venue's
rules to another venue's market.

`calculateOrderAmounts()` gives the three order-entry amounts from whichever
one the user typed. Every venue places an order by size alone, so the size is
the only amount that snaps onto a grid: the venue lot grid. Margin and notional
are display and comparison values. No quote grid applies to them.

| held       | `size`                                     | `notional`     | `margin`              |
| ---------- | ------------------------------------------ | -------------- | --------------------- |
| `size`     | `snapOrderSize(amount)`                    | `size × price` | `notional ÷ leverage` |
| `notional` | `snapOrderSize(amount ÷ price)`            | `size × price` | `notional ÷ leverage` |
| `margin`   | `snapOrderSize(amount × leverage ÷ price)` | `size × price` | `amount`, unchanged   |

- A held margin comes back byte-identical to the input string.
- `notional` is always the snapped size times the price, so it describes the
  order that the venue opens, not the input before the snap.
- A derived margin is exact SDK division: 40 decimal places, rounded half-up,
  with no trailing zeros.
- A derived size truncates onto the lot grid, so a held margin always funds
  its size: `size × price ≤ margin × leverage`.

The call gives `null` when `amount` or `price` is not a positive
`DecimalString`, when `leverage` is not a positive finite number, or when the
snapped size is zero (below one lot). A sub-cent margin is a valid order when
the lot grid takes the size.

```ts
import { calculateOrderAmounts } from '@lifi/perps-sdk'

const amounts = calculateOrderAmounts({
  sdk: client.client,
  market,
  held: 'margin',
  amount: '100',
  leverage: 5,
  price: '1000',
})
// { margin: '100', size: '0.5', notional: '500' }, or null — see above
```

Send `amounts.size` as `PlaceOrderParams.size`. It is the same string that the
size field shows.

`truncateDecimal(value, decimals)` rounds a decimal string down and pads it to
exactly `decimals` places, which seeds a fixed-decimal input field.
`numberToDecimalString(value)` spells a `number` from a venue or browser API as
a plain decimal string, so `1e-7` becomes `'0.0000001'`. `truncateDecimal` and
`decimalToBaseUnits` throw `PerpsError(ValidationError)` for a string that is
not a `DecimalString`, such as `'1e-8'`. `isDecimalString(value)` tests a
value against the same rule.

A provider plugin implements the same two rules for its own venue:
`snapOrderPrice(market: Market, price: DecimalString): DecimalString` and
`snapOrderSize(market: Market, size: DecimalString): DecimalString`.
`estimateLiquidationPrice()` stays on `number`, in and out: it is a
display-tier estimate for a screen, not a wire amount.

### Account-side wire helpers

Three helpers take and give a `DecimalString`, so an account figure never
passes through a `number`:

- `calculateTransferable(venueFigure, units)` clamps a venue free figure to
  `[0, units]`. It is the single cap behind `Balance.transferable` on every
  provider.
- `calculateWithdrawMax(row)` gives `WithdrawableBalance.max` from
  `available`, `withdrawalFee` and `isFeeDeducted`.
- `calculateRefuelAmount({ gasUsd, priceUsd, decimals })` divides the
  recommended gas value by the source-token price, rounds **up** onto the
  token grid and keeps trailing zeros to `decimals`, so a refuel never lands
  short. It gives `undefined` when either input is not greater than zero.

Each one throws `PerpsError(ValidationError)`, naming the field, when an
input is not a `DecimalString`.

## Numbers

### The `DecimalString` contract

Every monetary or quantity value that crosses a package, provider or network
boundary is a `DecimalString` from `@lifi/perps-types`. It matches
`DECIMAL_PATTERN`: an optional leading `-`, digits, and an optional `.` with
digits. It has no grouping, exponent, currency sign or whitespace. `'0.5'` and
`'-1250'` are `DecimalString`s; `'1e-7'`, `'1,000'`, `'.5'` and `'$1'` are not.

- `isDecimalString(value)` tests a value against the pattern.
- `truncateDecimal`, `decimalToBaseUnits` and the account-side `wire/`
  helpers throw `PerpsError(ValidationError)` for a string that fails the
  pattern. `calculateOrderAmounts` gives `null` for one.
- `baseUnitsToDecimal` throws `PerpsError(ValidationError)` for an amount that
  is not an integer string, such as `'1.5'` or `'1e3'`.
- No exported signature carries a `Big`. The SDK and the providers compute
  with `big.js` internally, and give back a `DecimalString` or a `number`.
- A `number` is for display math and small integers only, such as leverage,
  decimals, percentages and chart values. A `number` never goes to a venue.

### Three tiers

| Tier       | Holds                                                    | In → out                                  | Rule                                                        |
| ---------- | -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `decimal/` | `parseDecimal`, `<a>To<B>` conversions, `format*`        | representation → representation           | No domain words. Conversions throw on invalid input.        |
| `math/`    | display-tier formulas (`calculate*`, `estimate*`, …)     | `number` → `number`                       | Results are for `format*`. Never send one to a venue.       |
| `wire/`    | `calculateOrderAmounts`, `snapOrder*`, account helpers   | `DecimalString` → `DecimalString`         | Venue-ready values, snapped by the market's own provider.   |

A value for a venue comes from `wire/` or from a provider field. A value for a
screen goes through `parseDecimal`, then `math/`, then `format*`.

### Vocabulary

One verb names one kind of transformation.

| Verb                        | Input → output                                     | Fallible                          | Example                                                    |
| --------------------------- | -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `parse<X>`                  | `string` → typed value, or `undefined` on garbage  | yes                               | `parseDecimal`                                             |
| `<a>To<B>`                  | representation A → B, no domain meaning; A and B are each `baseUnits`, `decimal`, `decimalString` or `number` | throws on invalid, never guesses  | `decimalToBaseUnits`, `baseUnitsToDecimal`, `numberToDecimalString` |
| `format<X>`                 | value → human string (grouped, localised)          | no; renders a placeholder         | `formatUsd`, `formatNumber`                                |
| `snap<X>`                   | `DecimalString` → venue-grid `DecimalString`       | throws on a missing grid          | `snapOrderSize`, `snapOrderPrice`, `truncateDecimal`       |
| `calculate<X>`              | values → exact result by formula                   | no                                | `calculateNotionalValue`, `calculateOrderAmounts`          |
| `estimate<X>`               | values → approximation or forward-looking value    | no                                | `estimateLiquidationPrice`, `estimateAverageEntryPrice`    |
| `resolve<X>`                | candidates and rules → the one to use              | no                                | `resolveCloseSize`, `resolveQuote`                         |
| `validate<X>`               | values → ok or error result                        | —                                 | —                                                          |
| `is<X>` `would<X>` `has<X>` | → `boolean`                                        | —                                 | `isDecimalString`, `wouldImmediatelyLiquidate`             |
| `build<X>`                  | inputs → payload struct                            | —                                 | `buildQuote`                                               |
| `aggregate<X>`              | collection → totals                                | —                                 | —                                                          |

No function in `decimal/`, `math/` or `wire/` uses a `derive`, `predict` or
`convert` verb, or a bare noun as its name. The boundary spec checks every
name in these tiers against this table, and lists each exception with its
reason.

## WebSocket

`PerpsWsClient` streams prices, orderbook, and account events over WebSocket. Register a WS provider per DEX; `subscribe()` returns an unsubscribe function, and multiple listeners on the same channel share one wire subscription:

```ts
import { PerpsWsClient } from '@lifi/perps-sdk'
import { hyperliquidWsProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const ws = new PerpsWsClient(client, {
  wsProviders: { hyperliquid: hyperliquidWsProvider() },
})

const unsubscribe = await ws.subscribe(
  { channel: 'orderbook', dex: 'hyperliquid', marketId: markets[0].id },
  (event) => console.log(event.data)
)
```

## Architecture

### Package layering

`@lifi/perps-types` is a zero-dependency wire-type package at the base. The core `@lifi/perps-sdk` depends on it. Each provider plugin depends on `@lifi/perps-types` directly and takes the core SDK as a peer dependency — so your project installs exactly one copy of the SDK.

### Credential storage

Every provider persists its trading credentials (agent keys, API keys, session tokens) through a pluggable `StorageAdapter`. The default `localStorageAdapter` encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB — key material is never stored as plaintext. Environments without WebCrypto or IndexedDB degrade to non-persistent sessions rather than plaintext writes. Pass a custom adapter to a provider's store to use another backend.

## Examples

Runnable scripts live in the [`examples/`](https://github.com/lifinance/perps-sdk/tree/main/examples) directory of the repository — market data, account data, agent trading, error handling, custom storage, and WebSocket subscriptions.

## Documentation

- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
