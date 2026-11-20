<h1 align="center"><code>@lifi/perps-sdk-provider-extended</code></h1>

Extended provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Extended perpetuals through the unified interface of the SDK.

Extended settles on Starknet. The account signs each order, transfer, and withdrawal with a Stark key, and Extended authorizes each account request with an API key. The SDK makes both credentials in the client, from three signatures of the user's wallet. Neither credential goes to the LI.FI backend.

The LI.FI backend builds every request, with the builder fee in it. Because Extended needs the user's API key on each account request, the SDK signs the request, sends it to Extended itself, and then reports the sent request to the backend, which records it.

## Installation

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-extended viem@2.57.11
```

## Quick start

```ts
import { createPerpsClient, PerpsWsClient } from '@lifi/perps-sdk'
import {
  extendedProvider,
  extendedWsProvider,
} from '@lifi/perps-sdk-provider-extended'

const client = createPerpsClient({
  apiKey: 'your-api-key',
  providers: [extendedProvider()],
})

const ws = new PerpsWsClient(client, {
  wsProviders: { extended: extendedWsProvider() },
})
```

## Requests

Extended answers no CORS preflight, so a browser cannot call its account routes. The SDK sends each account request to the Extended proxy of the LI.FI API (`<apiUrl>/extended`). The proxy forwards the API key and does not keep it. The Stark private key stays on the device. The WebSocket connects to Extended directly.

To call Extended directly, for example from a server, set `apiUrl` or `requestUrl`.

## Account setup

The setup has two steps. The user's wallet signs three messages in total.

1. `CREATE_ACCOUNT`. The backend builds the onboarding request, with the LI.FI referral code. The wallet signs the `AccountCreation` typed data, whose signature is the seed of the Stark key, and the `AccountRegistration` typed data. The Stark key signs the wallet and its public key. The SDK returns the signed request, and the backend sends it to Extended, because onboarding needs no API key. Onboarding an existing account gives that account again.
2. `REGISTER_API_KEY`. The wallet signs a message for the API-key request. The SDK creates the API key for the wallet's main account, reads the account with the new key, and checks that Extended holds the same Stark key. On a new device, the wallet signs the key seed again; the same wallet always gives the same key.

The credentials go to the `StorageAdapter` (encrypted `localStorage` by default). If Extended refuses the stored API key, the SDK removes the credentials, and the setup steps appear again.

## Signing and execution

| Action | Signing method | What the SDK does |
| --- | --- | --- |
| Order placement, cancel, leverage | `stark` | Signs each Stark message of the step, writes the signatures into the request body, sends the request with the API key, and reports it to the backend with the venue order id. |
| Withdrawal | `stark` | Also writes the account's bridge address as the recipient and commits a Rhino.fi bridge quote. |
| Deposit | `evmTx` | Sends `approve` and `depositWithId` to the Rhino.fi bridge on Arbitrum from the user's wallet, with a bridge quote committed right before the deposit transaction, and reports each confirmed transaction to the backend. |

A request that Extended refuses, or that it does not confirm, stays a local result and is not reported.

The SDK refuses a Stark message that spends from another position, and a deposit transaction to an address that is not Extended's bridge contract.

Extended's own WebAssembly signer (`@x10xchange/stark-crypto-wrapper-wasm`) calculates the Stark keys, hashes, and signatures. The binary ships in `wasm/`, and the build checks that the ESM and CJS builds load it and sign.

## WebSocket

`extendedWsProvider()` uses Extended's v2 stream: one connection for all subscriptions. It streams the market context, the order book, trades, candles, and the account channels (`orderUpdates`, `fills`, `positions`, `accountSummary`). The account subscription carries the API key in the subscribe message, so a browser can open it.

## Not supported

- Spot markets.
- `spotBalances` and `availableToTrade` streams.
- Funding payments in `getActivity`.
- Deposits from a chain other than Arbitrum One.
