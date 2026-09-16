<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-hyperliquid/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-hyperliquid.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-hyperliquid</code></h1>

Hyperliquid provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Hyperliquid perpetuals through the SDK's unified interface.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

## Quick start

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})
```

## Agent key storage

Setup registers an agent keypair whose private key signs orders locally, so trading needs no per-order wallet popups. The agent key authorizes trading only — it cannot withdraw funds.

The keypair is persisted through a `StorageAdapter`. The default adapter encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB, so key material is never stored as plaintext. Pass your own `StorageAdapter` to the `HyperliquidAgentStore` constructor to use a different backend — a custom adapter bypasses this encryption and is responsible for protecting the key at rest.

## Order reads

`getOrders` returns `{ provider, orders, pagination }`. Each `Order` carries a
venue `orderId`, optional `clientOrderId`, lifecycle `status`, decimal quantities,
and timestamps. `type` distinguishes `RegularOrder`, `TriggerOrder`, and
`TwapOrder`. Trigger rows include a derived ABOVE or BELOW `triggerCondition`.

Attached TP/SL legs appear as separate PENDING rows with the parent's `oid` in
`parentOrderId`. Position-level triggers have no parent. A null `cloid` omits
`clientOrderId`. These order feeds contain no transaction hash, so they omit
`explorerLink`.

| Venue state | SDK status |
| --- | --- |
| Attached child while its parent rests | PENDING |
| `open`, no fills | OPEN |
| `open`, positive filled size | PARTIALLY_FILLED |
| `triggered` | TRIGGERED |
| `filled` | FILLED |
| `canceled`, `scheduledCancel`, documented cancellation reasons | CANCELLED |
| `rejected`, documented rejection reasons | REJECTED |
| TWAP `activated` | OPEN or PARTIALLY_FILLED |
| TWAP `waitingForTrigger` | OPEN |
| TWAP `finished` | FILLED |
| TWAP `terminated`, `stopped` | CANCELLED |
| TWAP `error` | REJECTED |

Hyperliquid does not document an EXPIRED order status. Unknown status strings
throw `PerpsError`. Cancel and rejection rows keep the venue reason in
`statusReason`.

```ts
import { getOrders } from '@lifi/perps-sdk'
import { OrderStatus } from '@lifi/perps-types'

const { orders } = await getOrders(client, {
  provider: 'hyperliquid',
  address: '0xUser',
  statuses: [OrderStatus.FILLED, OrderStatus.CANCELLED],
})
```

The default filter is `ACTIVE_ORDER_STATUSES`: PENDING, OPEN,
PARTIALLY_FILLED, and TRIGGERED. Active filters read `frontendOpenOrders`.
Terminal filters read `historicalOrders`. Mixed filters read both.
`twapHistory` supplies both running and finished TWAP parents.
`getOrder` reads `orderStatus` and uses the same mapper.

The venue returns at most 2,000 historical orders. The provider returns the
available matching rows in one response; it does not expose older pages.

The `orderUpdates` WebSocket feed omits execution metadata. The provider reads
`orderStatus` for each update, then retains the stream's status and quantities.
The provider emits frames in stream order after these HTTP reads finish.
Unavailable metadata reports a decode failure instead of inventing an order type.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface and the agent signing model
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
