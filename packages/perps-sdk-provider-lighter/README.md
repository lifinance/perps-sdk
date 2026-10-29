<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-lighter/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-lighter.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-lighter</code></h1>

Lighter provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Lighter perpetuals through the SDK's unified interface; signing runs through a bundled Go WASM signer.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-lighter
```

## Quick start

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { lighterProvider, lighterRhProvider } from '@lifi/perps-sdk-provider-lighter'

const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [lighterProvider(), lighterRhProvider()],
})
```

Each factory owns its deployment's endpoints, zkLighter signing chain id and collateral asset, and creates its own WASM signer, API-key store and read-only token manager. Registering both keeps their keys, tokens and caches separate.

## Portfolio value

Account summaries and the current portfolio-history anchor include Lighter's settlement equity (`total_asset_value`), every spot-route holding, and the marked USD value of non-settlement margin-route holdings. Settlement margin is already included in equity and is not added again. The deployment's settlement metadata distinguishes USDC on mainnet from USDG on Robinhood chain.

WebSocket account summaries retain spot and margin quantities from account snapshots and balance updates, and revalue non-settlement holdings on spot-market price updates. Assets without a matching spot price retain a zero USD value. These holdings do not change available margin or trading capacity.

## API key storage

Setup registers an API key user-side; the bundled WASM signer uses it to sign orders locally. Key material is persisted through a `StorageAdapter` — the default adapter encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB, so key material is never stored as plaintext. Pass `storage` to use another backend:

```ts
lighterProvider({ storage: myStorageAdapter })
```

## Referral and read authentication

Lighter applies a referral code permanently at sign-up. Any code on the account therefore satisfies `SET_REFERRAL`, whichever integrator owns it.

The `SET_REFERRAL` action uses a short-lived standard token. It first reads the referral code Lighter reports for the address. When Lighter reports a code, the action stores that code with the local API key and sends no `referral/use` request. When Lighter reports no code, the action sends the request and stores the code it sent. Lighter code `41003` on a non-5xx response answers that the account already carries a code, so the action stores the marker and reports no result. When Lighter accepts the request, the action reports an `Accepted` result. A parseable rejection code on a non-5xx response gives a `Failed` result with the venue `message`, and the mapped `errorCode` (`ExchangeRejected` when no mapping exists). A transport failure, HTTP 5xx, or response without a valid integer result code reports `Indeterminate`, because the SDK cannot tell if Lighter applied the code; it does not mark the referral applied or retry the request. A failed read of the applied code sends the request and lets Lighter decide.

`getAccount` reports `referralPresent: true` when the local key record carries a marker. It does not send a read-only token to a referral endpoint. A key record from an earlier package version has no marker, so `getAccount` reports `referralPresent: false` until the `SET_REFERRAL` action runs again. A `REGISTER_API_KEY` action keeps the marker on the new key record.

Before `getAccount` starts an authenticated read, it compares the local public key with the registered Lighter public key. A missing or different key prevents token creation and authenticated reads. If Lighter returns code `61006` for a read-only token, the provider creates one replacement and retries the read once. Responses with HTTP `401`, HTTP `403`, or code `20013` do not remove or replace the token.

Lighter does not evict API keys through `onExecuteResults`. A failed action alone does not establish that the stored key is invalid; the registered-public-key check determines whether authenticated operations may use it.

Each provider instance shares one request hold across its Lighter API clients, polls, and token-management requests. An HTTP `429` or HTTP `405` response starts the hold and fails at once with `RateLimitExceeded`. The provider does not retry that request. The provider uses `Retry-After` when Lighter supplies it, up to a maximum of five minutes. Otherwise, the hold lasts 60 seconds. All Lighter requests from that provider fail before network dispatch until the hold expires. Separate provider instances do not share a hold.

## Activity asset identity

Deposit, withdrawal, and transfer rows carry a registry `Asset`.
The provider resolves each numeric `asset_id` by its primary registry ID.
Read `asset.displaySymbol` for display and `asset.logoURI` for its icon.
An unresolved identity raises a stale or mis-keyed registry error.
`Fee.asset` remains a string.

Activity cursors with overflow rows use format version `2`. The provider rejects
older overflow formats instead of treating a display symbol as asset identity.
Restart pagination when the SDK reports this `ValidationError`.

## WASM signer loading

The package vendors Lighter's `web-wasm/main.wasm`, not the separate `wasm/` build. Market IDs retain the upstream integer range. The SDK passes order IDs as decimal strings. It also uses decimal strings for the create-order amount, price, and trigger price.

`wasm/lighter-signer.manifest.json` preserves the upstream build manifest. It records the source commit, source-tree hash, Go version, binary hash, runtime hash, and exports. The package build checks the binary and runtime hashes against that manifest.

Signer-global cleanup uses the manifest's export names. The package build also signs through the built ESM and CommonJS packages. Negative checks reject an altered binary or runtime with an unchanged manifest.

The Go signer binary ships as a separate asset that the package resolves itself. The ESM build uses `new URL('../../wasm/lighter-signer.wasm', import.meta.url)`. Webpack, Turbopack, and Vite production builds rewrite this expression into an emitted asset URL. Node reads the installed binary from disk. The loader checks the WASM preamble of the response. Vite's dependency optimizer can relocate the package into `.vite/deps`, which invalidates the static URL. The loader then resolves the asset through the bundler's own asset pipeline.

Go's `wasm_exec.js` ships inside a generated initializer that compiles into both CommonJS and ESM. Package imports do not initialize Go or install its globals. `loadLighterWasm()` initializes the runtime after reading the binary, so callers can install required polyfills after import. The package evaluates no script text.

Under a Content Security Policy, `script-src` must include `'wasm-unsafe-eval'` so the browser can run `WebAssembly.instantiate`. `'unsafe-eval'` is not required.

Applications need no `optimizeDeps.exclude`, no `?url`/`?raw` imports, no `public/` copy step, no caller-supplied URL and no bundler configuration. `loadLighterWasm()` is exported for hosts that want to load the signer before the user's first trade:

```ts
import { loadLighterWasm } from '@lifi/perps-sdk-provider-lighter'

await loadLighterWasm()
```

## Consumer verification

Run these commands from the repository root:

```sh
pnpm --filter @lifi/perps-sdk-provider-lighter exec playwright install chromium
pnpm --filter @lifi/perps-sdk-provider-lighter test:consumers
```

On Linux systems without browser libraries, use `playwright install --with-deps chromium` for the installation step.

The four Next targets execute the client probe in headless Chromium. They cover development and production with webpack and Turbopack. Browser exceptions, failed probes, missing results, and invalid WASM responses fail the checks. The checks also verify the emitted asset and its chunk reference.

Playwright is a development dependency. SDK consumers do not need it.

## Order reads

`getOrders` returns `{ provider, orders, pagination }`. Each order belongs to the `Order` union.
The `type` field selects `RegularOrder`, `TriggerOrder`, or `TwapOrder`.
Every row includes its lifecycle `status`, original size, remaining size, filled size, side, and timestamps.
Trigger rows include `triggerPrice`, a derived `triggerCondition`, and `limitPrice` from the venue `price`.
On a market trigger, `limitPrice` is the slippage-adjusted limit price that Lighter holds.
TWAP rows include `durationSeconds` and `startedAt`. TWAP children are regular orders with a `parentOrderId`.

`orderId` contains the venue `order_index`. `clientOrderId` contains the nonzero `client_order_index`.
`parentOrderId` contains `parent_order_id` when the venue supplies it.
Lighter order rows contain no transaction hash, so `explorerLink` stays absent.
`getOrder` uses the same mapper and accepts a venue id or a `client_order_index:<index>` reference.

| Lighter status | SDK status |
| --- | --- |
| `in-progress` | `ACCEPTED` |
| `pending` | `OPEN` |
| `open` with `trigger_status: parent-order` | `PENDING` |
| `open` with a positive filled amount | `PARTIALLY_FILLED` |
| `open` | `OPEN` |
| `triggered` | `TRIGGERED` |
| `filled` | `FILLED` |
| `canceled` and documented cancellation variants | `CANCELLED` |
| `canceled-expired` | `EXPIRED` |

Cancelled rows give a short display text for the venue status in `statusReason`, not the venue status code.
Only an unknown status throws `PerpsError`.

```ts
import { OrderStatus } from '@lifi/perps-types'

const history = await client.getOrders({
  address,
  statuses: [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
})
```

Without `statuses`, the provider requests `PENDING`, `OPEN`, `PARTIALLY_FILLED`, and `TRIGGERED`.
An empty status list returns no orders.
Active filters use `accountActiveOrders`. Terminal filters use `accountInactiveOrders`.
A mixed filter reads both endpoints. Running and finished TWAP parents use these same reads.
Active reads return the complete snapshot and do not apply `limit` or `cursor`.
History reads apply `limit` and `cursor`; the response retains the venue continuation cursor even when filtering removes rows.
WebSocket order updates contain `{ orders, terminated }`, including terminal order rows and their ids.

## Liquidations

A Lighter order of type `liquidation` maps to a `MARKET` `RegularOrder` with
`isLiquidation: true`.

Lighter marks a forced trade with the trade `type`. The liquidation engine
sends the order of the liquidated account as the taker. Thus `Fill.liquidation`
is set on the taker fill only, on mainnet and on Robinhood chain:

| Trade `type` | `Fill.liquidation.method` |
| --- | --- |
| `liquidation`: a partial liquidation on the order book | `MARKET` |
| `deleverage`: a takeover by the LLP, or auto-deleveraging | `DELEVERAGE` |

The maker fill of a forced trade carries no `liquidation`. A `trade` row and a
`market-settlement` row also carry none. Lighter reports no mark price on a
trade, so `markPrice` stays absent. A `deleverage` row can report a `price` of
zero. The SDK shows this venue value unchanged.

## Market TP/SL slippage

A Lighter market TP/SL order needs a slippage-adjusted limit price: the lowest fill for a sell, or the highest fill for a buy.
The provider sets `triggerOrders.marketSlippage` from `LIGHTER_MARKET_SLIPPAGE_PERCENT`. Its `min`, `max`, `step`, and `default` are `'1'`, `'10'`, `'0.01'`, and `'1'`, in percent.
Keep the slippage percent from `min` to `max`.
Calculate the price with `snapOrderPrice(sdk, market, calculateSlippagePrice(triggerPrice, slippagePercent, isBuy))` from `@lifi/perps-sdk`, where `isBuy` is `true` for a buy trigger order.
`calculateSlippagePrice` multiplies `triggerPrice` by `1 + slippagePercent / 100` for a buy and divides it by that value for a sell.
`snapOrderPrice` rounds the result half-up to the market `priceDecimals`, and throws a `ValidationError` for a market without `priceDecimals`.
Send the result as the `limitPrice` of a `MARKET` trigger leg.

A Lighter modify cannot change the order type, so `triggerOrders.modifyCanChangeType` is `false`.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface, the auth-token model, and the browser/Vite WASM configuration
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
