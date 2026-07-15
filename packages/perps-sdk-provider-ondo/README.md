<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-ondo/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-ondo.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-ondo)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

<h1 align="center"><code>@lifi/perps-sdk-provider-ondo</code></h1>

Ondo Perps provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Ondo perpetuals through the SDK's unified interface.

Ondo authenticates with a JWT session token obtained through a SIWE (ERC-4361) login: the backend issues the challenge, the user signs it with their wallet, and this package completes the login directly against Ondo — the JWT never transits the LI.FI backend and is persisted browser-side only.

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

- `ondoProvider()` — the `PerpsProviderPlugin` registered via `createPerpsClient({ providers: [ondoProvider()] })`: SIWE session login, authenticated account reads direct against Ondo, and quote/fee display from Ondo's public base fee schedule.
- `ondoWsProvider()` — the WebSocket provider registered via `new PerpsWsClient(client, { wsProviders: { ondo: ondoWsProvider() } })`: orderbook, trades, candles and market context, plus JWT-authenticated order/fill/position streams.
- `OndoApiClient` — HTTP boundary against Ondo's REST API. Unwraps Ondo's `GenericResponse` envelope, attaches `Authorization: Bearer <JWT>` when a session token is supplied, and surfaces typed errors (`OndoApiError`, `OndoSessionExpiredError`).
- `completeSiweLogin` — signs a SIWE challenge with the user's wallet and exchanges it for an Ondo session token (`OndoAuthToken`).
- `OndoTokenStore` — persists the session token per wallet address and environment via a `StorageAdapter`; expired tokens read back as absent.

## Environments

Production `https://api.ondoperps.xyz` is the default; the sandbox `https://api.ondoperps-sandbox.xyz` can be selected by passing its base URL.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/)
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
