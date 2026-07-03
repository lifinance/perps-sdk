# @lifi/perps-sdk-provider-ondo

Ondo Perps provider plugin for [`@lifi/perps-sdk`](https://github.com/lifinance/perps-sdk).

Ondo authenticates with a JWT session token obtained through a SIWE (ERC-4361)
login: the LI.FI backend issues the challenge (embedding the LI.FI builder
code), the user signs it with their wallet, and this package completes the
login directly against Ondo — the JWT never transits the LI.FI backend and is
persisted browser-side only.

## What this package provides

- `ondoProvider()` — the `PerpsProviderPlugin` registered via
  `createPerpsClient({ providers: [ondoProvider()] })`: SIWE session login,
  authenticated account reads direct against Ondo, and quote/fee display from
  Ondo's public base fee schedule.
- `ondoWsProvider()` — the realtime WS provider registered via
  `new PerpsWsClient(client, { wsProviders: { ondo: ondoWsProvider() } })`:
  orderbook, trades, candles and market context, plus JWT-authenticated
  order/fill/position streams.
- `OndoApiClient` — HTTP boundary against Ondo's REST API. Unwraps Ondo's
  `GenericResponse` envelope, attaches `Authorization: Bearer <JWT>` when a
  session token is supplied, and surfaces typed errors (`OndoApiError`,
  `OndoSessionExpiredError`).
- `completeSiweLogin` — signs a SIWE challenge with the user's wallet and
  exchanges it for an Ondo session token (`OnAuthToken`).
- `OndoTokenStore` — persists the session token per wallet address and
  environment via a `StorageAdapter`; expired tokens read back as absent.

## Environments

Production `https://api.ondoperps.xyz` is the default; the sandbox
`https://api.ondoperps-sandbox.xyz` can be selected by passing its base URL.

## Installation

```bash
pnpm add @lifi/perps-sdk-provider-ondo
```
