<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-ondo/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-ondo.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-ondo</code></h1>

Ondo Perps provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Ondo perpetuals through the SDK's unified interface.

Ondo authenticates in two stages, both completed client-side. A SIWE (ERC-4361) login — challenge issued by the backend, signed by the user's wallet — yields a JWT session token used for authenticated reads. The package then creates a trading API key via the JWT (`POST /v1/api_keys`) and signs every mutating trade action with it per-request (HMAC-SHA256). None of the wallet's login signature, the JWT, or the API key secret transits the LI.FI backend; the JWT and key are persisted browser-side through the storage adapter.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-ondo
```

## Quick start

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { ondoProvider } from '@lifi/perps-sdk-provider-ondo'

const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [ondoProvider()],
})
```

## What this package provides

- `ondoProvider()` — the `PerpsProviderPlugin` registered via `createPerpsClient({ providers: [ondoProvider()] })`: SIWE session login, JWT-authenticated account reads direct against Ondo, API-key-signed trade actions, and quote/fee display from Ondo's public base fee schedule.
- `ondoWsProvider()` — the WebSocket provider registered via `new PerpsWsClient(client, { wsProviders: { ondo: ondoWsProvider() } })`: orderbook, trades, candles and market context, plus JWT-authenticated order/fill/position streams.
- `OndoApiClient` — HTTP boundary against Ondo's REST API. Unwraps Ondo's `GenericResponse` envelope, attaches `Authorization: Bearer <JWT>` when a session token is supplied, and surfaces typed errors (`OndoApiError`, `OndoSessionExpiredError`).
- `completeSiweLogin` — signs a SIWE challenge with the user's wallet and exchanges it for an Ondo session token (`OndoAuthToken`).
- `OndoTokenStore` — persists the session token per wallet address and environment via a `StorageAdapter`; expired tokens read back as absent.
- `OndoApiKeyStore` — persists the trading API key per wallet address and environment; the key is created on first use via the JWT (the venue reveals the secret only once) and signs mutating requests thereafter.

## Orders

`getOrders` returns `{ provider, orders, pagination }`. Each `Order` has one
`type` discriminator and one lifecycle `status`:

- `MARKET` and `LIMIT` rows carry `timeInForce` and an optional `price`.
- `STOP_MARKET`, `STOP_LIMIT`, `TAKE_PROFIT_MARKET`, and `TAKE_PROFIT_LIMIT`
  rows carry `triggerPrice` and `triggerCondition`. Limit triggers also carry `limitPrice`.
- `TWAP` rows carry `durationSeconds` and `startedAt`.

Every row carries the venue `orderId`, sizes, side, market, `reduceOnly`, and
creation/update times. Ondo's optional `clientOrderId` and `parentOrderId` remain
separate fields. The mapper omits `explorerLink` because these venue rows carry no transaction hash.

| Ondo status | SDK status |
| --- | --- |
| `open`, `untriggered` | `OPEN`, or `PARTIALLY_FILLED` when the filled size is positive |
| `fullyfilled` | `FILLED` |
| `canceled` | `CANCELLED`; `statusReason` preserves the venue cancellation reason |
| TWAP `running` | `OPEN`, or `PARTIALLY_FILLED` when the filled size is positive |
| TWAP `completed` | `FILLED` |
| TWAP `cancelled` | `CANCELLED`; `statusReason` preserves the venue cancellation code |
| `pending` or an unknown status | The mapper throws `PerpsError` |

`getOrders({ statuses })` defaults to `ACTIVE_ORDER_STATUSES`: `PENDING`,
`OPEN`, `PARTIALLY_FILLED`, and `TRIGGERED`. Active reads use
`/v1/perps/orders?status=open` and `/v1/perps/twap/orders/running`.
Terminal reads use the documented order history queries
`/v1/perps/orders?status=canceled` and `/v1/perps/orders?status=fullyfilled`,
plus `/v1/perps/twap/orders/history`. A mixed filter reads both endpoint groups.
The provider applies the exact requested status filter after the mapper.

```ts
import { OrderStatus } from '@lifi/perps-types'

const history = await client.getOrders({
  address,
  statuses: [OrderStatus.FILLED, OrderStatus.CANCELLED],
})
```

`marketId` restricts provider reads to one market. The pagination cursor keeps
each endpoint's position independent. Pass the returned cursor unchanged to
the next request, with the same market and status filter.
The cursor stores unconsumed running TWAP rows from the first snapshot.
Later pages do not read the running feed again.
`getOrder` uses the same order mapper as the list read. After a regular
lookup returns `order_not_found`, it checks `/v1/perps/twap/order/{orderID}`.
WebSocket `orderUpdates.data.orders` includes terminal rows.
`orderUpdates.data.terminated` also contains their ids.
Fills carry no lifecycle status.

## Activity coverage

`getActivity` reports four movement types from Ondo's authenticated REST API:

| Activity type | Endpoint                        | Paging           |
| ------------- | ------------------------------- | ---------------- |
| `FUNDING`     | `/v1/perps/funding_fees`        | cursor           |
| `LIQUIDATION` | `/v1/perps/liquidation_history` | cursor           |
| `DEPOSIT`     | `/v1/wallet/deposits`           | none — full list |
| `WITHDRAWAL`  | `/v1/wallet/withdrawals`        | none — full list |

`/v1/wallet/deposits` and `/v1/wallet/withdrawals` accept no cursor and return
the whole history in one response, so `getActivity` calls each on the first
page only and carries the rows past the page `limit` in the activity cursor.

`asset` on a `DEPOSIT` or a `WITHDRAWAL` is Ondo's own `coin`, which is already
a display symbol. Ondo charges a withdrawal fee in USD (`usdFee`) rather than
in the withdrawn asset, so `WithdrawalActivity.fee` carries `asset: 'USD'` on
a withdrawal where Ondo reports a `usdFee`, and is absent otherwise. A
consumer that formats the fee must read `fee.asset` and never reuse the
withdrawal's own `asset`. A withdrawal Ondo reports as
`failure` or `cancelled` moved no value and is dropped.

`getActivity` never returns a `TRANSFER` item for Ondo. Ondo's transfer surface
moves value between the `main` and `margin` wallets of one account, and
`TransferActivity` reports movements between two distinct accounts only. A
request that filters for `TRANSFER` alone returns an empty page and makes no
upstream call.

## Environments

Production `https://api.ondoperps.xyz` is the default; the sandbox `https://api.ondoperps-sandbox.xyz` can be selected by passing its base URL.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
