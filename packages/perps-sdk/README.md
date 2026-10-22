<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk.svg)](https://www.npmjs.com/package/@lifi/perps-sdk)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk</code></h1>

Core of the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/) — a TypeScript SDK for trading perpetuals across multiple DEXes through one unified interface.

- **Unified API** across perpetual DEXes (Hyperliquid, Lighter, Lighter Robinhood, Ondo).
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
| [`@lifi/perps-sdk-provider-lighter`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter) | Lighter, Lighter Robinhood |
| [`@lifi/perps-sdk-provider-ondo`](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo) | Ondo |

The Lighter package exports two provider factories. `lighterProvider()`
registers Lighter mainnet as the provider `lighter`, which settles in USDC.
`lighterRhProvider()` registers the Lighter deployment on Robinhood chain as
the provider `lighter-rh`, which settles in USDG. Each factory keeps its own
signer, API-key store, and caches, so you can register both on one client.
In this README, "Lighter" applies to both deployments.

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

## Transport options

`PerpsConfig` accepts three HTTP transport options:

- `retry`: a `RetryConfig`. Pass `false` to send each request one time only.
  Pass one `RetryPolicy` for all providers, or an object keyed by provider
  type (`'lifi'` for backend requests) with an optional `default`. A provider
  that the object does not name uses its built-in policy.
- `fetch`: a replacement for the global `fetch` in the SDK and provider HTTP
  clients. It does not change the retry policy.
- `requestInterceptor`: a hook that receives the URL and the `RequestInit` of
  each request. It returns the `RequestInit` that the SDK sends.

`DISABLED_RETRY` is the resolved single-attempt policy. A provider author
passes it as the `policy` of `fetchWithRetry`, for example on a write request.

`PerpsClientOptions` does not accept these three options. To use them, call
`createPerpsClient` and pass the result to the service functions.

```ts
const client = createPerpsClient({
  providers: [hyperliquidProvider()],
  retry: { default: { maxAttempts: 2 }, lifi: false },
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

The client has these other write methods:

- `withdraw()`, `sendAsset()`, and `updatePositionMargin()` wrap one venue
  action each.
- `execute({ provider, address, action, params, onProgress })` runs any
  `ActionType`. All the wrappers above call it. `onProgress` is optional and
  reports each on-chain leg, for example the approval and the deposit.
- `submitOnboarding()` and `createReferralCode()` wrap `executeMetaAction()`.
  A meta action has no venue. The user wallet signs it as EIP-712 typed data.

Account-specific reads go directly to the venue. `getOrders()` returns the
`Order` union with regular, trigger, and TWAP rows. Its default filter is
`ACTIVE_ORDER_STATUSES`. Use `statuses` to read history.

`getWithdrawableBalances()` returns the `(asset, category)` pairs an address can
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

`getWithdrawalTypes()` returns the withdrawal types an address can choose per
withdrawable holding. Each row has a `source` (`categoryId` and `asset.id`) and
one option per `WithdrawalType`. An option has its own `max` and the
`withdrawalOptions` to send unchanged in `WithdrawalParams`, together with the
row's `source`. Lighter implements it: every row offers `STANDARD`, and the
collateral asset's perps row also offers `FAST` when Lighter's fast-withdraw
operator accepts the account. The `FAST` `max` is also capped by the venue's
fast-withdraw limits. Without a Lighter API key, or when a fast-withdraw read
fails, Lighter offers `STANDARD` only. The client removes each option whose
`max` is below the asset's `minWithdrawalAmount`. The client resolves
`undefined` for Hyperliquid and Ondo.

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

### Wallet setup

The user wallet signs each action whose descriptor names `PerpsSigner.USER`
as its signer. The wallet is a viem `WalletClient` with an account.

- On a `PerpsClient`, call `setUserWallet(wallet)`. Pass `undefined` to clear
  the wallet. `PerpsClientOptions` has no `userWallet` option.
- On a client from `createPerpsClient`, pass `userWallet` in `PerpsConfig`.

Before the SDK signs a USER-signed EIP-712 action, it calls the
`SwitchChainHook` with the target chain ID. The hook resolves to a wallet on
that chain, or to `undefined` when it cannot switch. Pass the hook as the
`switchChain` option of `PerpsClientOptions`, or call `setSwitchChain()`.
Without a hook, a wallet on the wrong chain signs without a switch.

```ts
client.setUserWallet(walletClient)
client.setSwitchChain(async (chainId) => {
  await walletClient.switchChain({ id: chainId })
  return walletClient
})
```

### Agent setup

A provider account needs setup steps before it can trade, for example an
agent approval. `checkSetup({ provider, address })` returns a `ProviderSetup`:

- `accountExists`: `false` for an address with no venue account. Send a
  deposit first.
- `setup`: the unsatisfied steps that the user wallet signs, in `sequence`
  order. The SDK signs and sends the SDK-signed steps inside `checkSetup()`.
- `checklist`: the list to show to the user, with each step and its
  `satisfied` state.
- `isReady`: `true` when no step is staged and each choice is satisfied.

Send a step with `executeProviderSetupAction({ provider, address, step,
checklist })`. Use the `checklist` from the same `checkSetup()` result. The
method throws when a lower-`sequence` step on that `checklist` is not
satisfied, so call `checkSetup()` again after each step. A
choice step, for example Lighter `ACCOUNT_TYPE`, has `options`. Send the
option that the user selects with `executeProviderOption({ provider, address,
option })`. `executeProviderRevoke({ provider, address, step })` sends the
`revoke` action of a satisfied step. `buildProviderSetup({ provider, address
})` returns the unsigned USER-signed steps and does not send them.

```ts
const provider = 'hyperliquid'
const address = '0xUser'

const { setup, checklist } = await client.checkSetup({ provider, address })
const [step] = setup
if (step !== undefined) {
  await client.executeProviderSetupAction({ provider, address, step, checklist })
}
const { isReady } = await client.checkSetup({ provider, address })
```

### Execution reports

Every write wrapper, setup step, setup option, and revoke resolves to an
`ExecuteActionResponse`. The response holds one `ActionResult` per action
step, in step order. Each result carries a `UserActionStatus`:

- `Submitted`: the venue acknowledged the step. The acknowledgement is not
  proof that the venue applied the step.
- `Accepted`: the venue provably took and applied the step.
- `Indeterminate`: the SDK cannot tell if the venue applied the step. Read the
  account state before you send the step again.
- `Failed`: the venue refused the step. Nothing was applied.

`Submitted` and `Accepted` mean that the action took effect. Call
`isSubmittedOrAccepted(result)` to test for them. For any other result, show
`result.error`. An `Indeterminate` error ends with advice to check the account
before a retry.

```ts
import { ActionType, isSubmittedOrAccepted } from '@lifi/perps-sdk'

const { results } = await client.execute({
  provider: 'hyperliquid',
  address: '0xUser',
  action: ActionType.CANCEL_ORDER,
  params: { ids: ['123'] },
})
for (const result of results) {
  if (!isSubmittedOrAccepted(result)) {
    console.warn(result.status, result.error)
  }
}
```

A failed or indeterminate step is a result, not an exception. The SDK signs
and sends no further client step after a step that is not `Submitted` or
`Accepted`, so those steps have no result. A result keeps the identifiers the venue returned
(`orderId`, `twapId`, `txHash`, `explorerLink`) for every status.

When a later stage throws after some results are known, the client throws a
`PerpsExecutionError`. Its `response` holds the known results and its `cause`
holds the original error. A failure before any result is known throws the
original error.
For a `PerpsError` cause, the wrapper preserves its `code` and provider `tool`.

An `Accepted` result describes the venue effect, not successful local bookkeeping.
For example, an Ondo login can be accepted before saving its session token fails.
The call then throws `PerpsExecutionError` with that accepted result and the storage
failure as its cause; it does not report that the account is ready to trade.
Re-read `checkSetup()` before trading after setup, including when the report is empty.

Provider authors can use the exported `rethrowWithKnownResults(known, error)`.
It prepends `known` to a nested `PerpsExecutionError` report and retains the original
cause. With no known results, it rethrows the original error unchanged.

```ts
import { PerpsExecutionError, UserActionStatus } from '@lifi/perps-sdk'

try {
  const { results } = await client.cancelOrders(params)
  for (const result of results) {
    if (result.status === UserActionStatus.Indeterminate) {
      // Read the open orders before you cancel again.
    }
  }
} catch (error) {
  if (error instanceof PerpsExecutionError) {
    console.log(error.response.results, error.cause)
  }
}
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
needs a session. Without a session, the Ondo read throws
`PerpsError(SetupRequired)`. It does not fall back to the account summary.
Lighter publishes no per-market figure, so the Lighter
provider calculates it over REST only, from `availableMargin` and the open
position on each perps market. The side that adds to the position gets
`availableMargin`. The side that reduces or flips the position gets the
initial margin requirement of the position, plus `availableMargin` and the
margin that the close releases. For Lighter spot markets and for every other
provider, the client falls back to the account summary, so `buy` and `sell`
both equal `availableMargin`.

Each collateral row in `Account.collateralBalances` and each spot row carries
`transferable`: the part of `units` that the venue releases from that category.
The value is always from `0` to `units`. Each `spotBalances` WebSocket frame
carries `transferable` for its spot rows. Hyperliquid fills it. No WebSocket
channel updates the collateral rows. `transferable` is not the withdrawal
ceiling: read `getWithdrawableBalances` for that.

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
rules to another venue's market. `safeSnapOrderPrice(sdk, market, price)`
gives the same result for a display, or `undefined` where `snapOrderPrice`
throws. It writes one warning per market, not one per call.

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

The call throws `PerpsError(ValidationError)` that names `amount` or `price`
when it is not a positive decimal, or `leverage` when it is not a finite number
above zero. It also throws, with the lot size in the message, when the snapped
size is zero (below one lot). `safeCalculateOrderAmounts` gives `undefined` in
place of the throw. A sub-cent margin is a valid order when the lot grid takes
the size.

`OrderAmountsInput.leverage` is a `number`. `Position.leverage` is a
`DecimalString`, so a caller converts it with `safeDecimalStringToNumber`.

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
// { margin: '100', size: '0.5', notional: '500' }
```

Send `amounts.size` as `PlaceOrderParams.size`. It is the same string that the
size field shows.

`roundDecimalString(value, decimals, rounding)` rounds to `decimals` places
and keeps no trailing zeros. The `rounding` argument is a `DecimalRounding`:
`'truncate'` (toward zero), `'round'` (half away from zero), or `'up'` (away
from zero).
`numberToDecimalString(value)` spells a `number` from a venue or browser API as
a plain decimal string, so `1e-7` becomes `'0.0000001'`.

A provider plugin implements the same two rules for its own venue:
`snapOrderPrice(market: Market, price: DecimalString): DecimalString` and
`snapOrderSize(market: Market, size: DecimalString): DecimalString`.
`estimateLiquidationPrice()` takes and gives a decimal string.

### Account-side wire helpers

Three helpers take and give a `DecimalString`, so an account figure never
passes through a `number`:

- `calculateTransferable(venueFigure, units)` clamps a venue free figure to
  `[0, units]`. It is the single cap behind `Balance.transferable` on every
  provider.
- `calculateWithdrawMax(row)` gives `WithdrawableBalance.max` from
  `available`, `withdrawalFee` and `isFeeDeducted`.
- `calculateRefuelAmount({ recommendedAmount, recommendedUsd, nativeBalance, priceUsd, decimals })`
  gives the source-token amount that buys the native gas deficit. The
  deficit is `recommendedAmount` minus `nativeBalance`, both in base units,
  valued pro rata on `recommendedUsd`. The helper adds
  `REFUEL_FEE_MARGIN_PERCENT` (20%) for the route fees, divides by
  `priceUsd`, rounds **up** onto the token grid and keeps trailing zeros to
  `decimals`, so a refuel never lands short. It gives `undefined` when the
  wallet already holds the recommendation, or when the recommendation, its
  USD value or the price is not greater than zero.

Each one throws `PerpsError(ValidationError)` when an input does not match the
decimal pattern. `calculateRefuelAmount` also throws when a
base-unit input is not an integer string.

## Numbers

### Decimal strings

Every monetary or quantity value is a decimal string (`DecimalString` is an
alias of `string`). Inside the SDK every calculation uses `big.js`; no exported
signature carries a `Big` or does float math on an amount.

- Display shows the venue string unchanged. The SDK tests a string only where
  it sorts or calculates with it.
- To read a string for a calculation, the SDK tests `DECIMAL_PATTERN`
  (`/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/`), then reads it with `big.js`. The pattern
  accepts an optional `-`, an integer part, and an optional `.` with digits.
  The integer part is `0` or starts with a non-zero digit, so `'01'` fails the
  test. The SDK does not clean the string. A display form such as `'$4'`
  or `'0.05%'`, or an exponent form such as `'1e-7'`, fails the test and
  throws.
- `isDecimalString(value)` tests a value against `DECIMAL_PATTERN`. It never
  throws.
- `decimalStringToNumber` is for chart and pixel values only. A `number` holds
  about 15 significant digits.

### `X` and `safeX`

Each fallible function has two forms:

- `X(...)` throws `PerpsError(ValidationError)` on an input that does not
  match the decimal pattern, or on a degenerate input such as a zero divisor.
  The message names the parameter.
- `safeX(...)` calls `X`, catches any error, logs a `console.warn` with the
  function name and the error, and gives `undefined`. It has no default: the
  caller writes `?? fallback`.

The usage of a value sets the form. A money-path value becomes, or limits, a
user action sent to a venue: order size, price, margin, fees, slippage, close
size, TP/SL, and withdraw, transfer or deposit amounts. It uses `X`. A display
value already exists: position, order and fill rows, PnL, history, account
totals and WebSocket updates. It uses `safeX`, and the row stays.

| Group      | Functions                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Arithmetic | `addDecimalString`, `addDecimalStrings`, `subtractDecimalString`, `multiplyDecimalString`, `divideDecimalString` (40 places, half-up), `divideDecimalStringRoundDown` (40 places, truncate) |
| Compare    | `compareDecimalStrings`, `isDecimalStringGreaterThan`, `isDecimalStringZero`                                                                  |
| Convert    | `roundDecimalString`, `scaledIntegerToDecimalString`, `numberToDecimalString`, `decimalStringToNumber`, `decimalStringToScaledInteger`, `timestampToIsoString` |
| Formulas   | every `calculate*` except `calculateAverageFillPrice`, every `estimate*`, `buildQuote`, `resolveCloseSize` and `wouldImmediatelyLiquidate` in `math/` |
| Wire       | `calculateOrderAmounts`                                                                                                                      |

`calculateAverageFillPrice` never throws and has no `safe` form. It skips a
fill whose `size` or `price` does not match the decimal pattern. It gives
`undefined` when the summed size is not above zero.

`format*` is display only. It formats with `big.js`, shows a string that does
not match the decimal pattern unchanged, and shows the placeholder for `null`
or `undefined`. It never throws and has no `safe` form.

### Three tiers

| Tier       | Holds                                                         | In → out          | Rule                                                       |
| ---------- | ------------------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `decimal/` | arithmetic, compare, `<a>To<B>` conversions, `format*`        | string → string; `number` from `decimalStringToNumber` and `decimalStringToScaledInteger` | No domain words. See the vocabulary for each failure mode. |
| `math/`    | trading formulas (`calculate*`, `estimate*`, …)               | string → string   | Estimates for a screen or a preview.                       |
| `wire/`    | `calculateOrderAmounts`, `snapOrder*`, account helpers        | string → string   | Venue-ready values, snapped by the market's own provider.  |

A value for a venue comes from `wire/` or from a provider field.

### Vocabulary

One verb names one kind of transformation.

| Verb                        | Input → output                                     | Fallible                          | Example                                                    |
| --------------------------- | -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| `parse<X>`                  | `string` → typed value, or `null` on garbage       | no; gives `null`                  | `parseStoredRecord`                                        |
| `<a>To<B>`                  | representation A → B, no domain meaning; A and B are each `scaledInteger`, `decimalString`, `number`, `timestamp` or `isoString` | throws on invalid; `safe<a>To<B>` gives `undefined` | `scaledIntegerToDecimalString`, `numberToDecimalString`, `decimalStringToNumber` |
| `format<X>`                 | value → human string (grouped, localised)          | no; renders the value or a placeholder | `formatUsd`, `formatNumber`                                |
| `snap<X>`                   | `DecimalString` → venue-grid `DecimalString`       | throws on a missing grid          | `snapOrderSize`, `snapOrderPrice`                          |
| `calculate<X>`              | values → exact result by formula                   | throws; `safe` form               | `calculateNotionalValue`, `calculateOrderAmounts`          |
| `estimate<X>`               | values → approximation or forward-looking value    | throws; `safe` form               | `estimateLiquidationPrice`, `estimateAverageEntryPrice`    |
| `resolve<X>`                | candidates and rules → the one to use              | `resolveCloseSize` throws; `safe` form. `resolveMatchingPosition` never throws | `resolveCloseSize`, `resolveMatchingPosition` |
| `is<X>`                     | value → `boolean`, a pattern test                  | no                                | `isDecimalString`                                          |
| `is<X>` compare predicates  | decimal strings → `boolean`                        | throws; `safe` form               | `isDecimalStringZero`, `isDecimalStringGreaterThan`        |
| `would<X>` `has<X>`         | → `boolean`                                        | throws; `safe` form               | `wouldImmediatelyLiquidate`                                |
| `build<X>`                  | inputs → payload struct                            | throws; `safe` form               | `buildQuote`                                               |
| `aggregate<X>`              | collection → total                                 | throws; `safe` form               | `addDecimalStrings`                                        |

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

`subscribe()` takes an optional third argument, `onStatus`. It receives each
`WsConnectionStatus` change of the connection: `'connected'`,
`'reconnecting'` after a transient drop, or `'disconnected'` when the client
stops the reconnection. Call `reconnect(provider)` to open a `'disconnected'`
connection again.

`subscribeQuote(params, onQuote)` streams a live fill `Quote` for a `symbol`,
`side`, USD `size`, and `type`. The provider builds the quote on its orderbook
channel, so an orderbook subscription on the same market shares one wire
subscription. `streamsCandles(provider)` tells, before the first subscribe,
whether the provider streams the `candle` channel.

`close()` closes each connection. After `close()`, `subscribe()` and
`subscribeQuote()` reject. Create a new `PerpsWsClient` to subscribe again.

```ts
const stopQuote = await ws.subscribeQuote(
  { provider: 'hyperliquid', symbol: 'ETH', side: 'buy', size: '1000', type: 'perps' },
  (quote) => console.log(quote.expectedFillPrice)
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
