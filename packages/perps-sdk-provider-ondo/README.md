<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-ondo/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-ondo.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-ondo</code></h1>

Ondo Perps provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Ondo perpetuals through the SDK's unified interface.

Ondo authenticates in two stages, both completed client-side. A SIWE (ERC-4361) login — challenge issued by the backend, signed by the user's wallet — yields a JWT session token used for authenticated reads. The package then creates a trading API key via the JWT (`POST /v1/api_keys`) and signs every mutating trade action with it per-request (HMAC-SHA256). Neither the JWT nor the API key secret transits the LI.FI backend; both are persisted browser-side through the storage adapter.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-ondo
```

## Quick start

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { ondoProvider } from '@lifi/perps-sdk-provider-ondo'

const client = createPerpsClient({
  integrator: 'my-app',
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

## Environments

Production `https://api.ondoperps.xyz` is the default; the sandbox `https://api.ondoperps-sandbox.xyz` can be selected by passing its base URL.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
