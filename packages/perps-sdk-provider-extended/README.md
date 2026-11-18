<h1 align="center"><code>@lifi/perps-sdk-provider-extended</code></h1>

Extended provider plugin for the [LI.FI Perps SDK](https://public-perps-docs.mintlify.app/). Register it on a `PerpsClient` to trade Extended perpetuals through the unified interface of the SDK.

Extended settles on Starknet. The account signs each order, transfer, and withdrawal with a Stark key, and Extended authorizes each account request with an API key. The SDK makes both credentials in the client, from three signatures of the user's wallet. Neither credential goes to the LI.FI backend: the SDK sends every account request and every signed action to Extended itself.

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

## Account setup

The setup step is `REGISTER_API_KEY`. It runs in the client, and the user's wallet signs three messages:

1. The `AccountCreation` typed data. The signature of these typed data is the seed of the Stark key. The same wallet always gives the same key, so a new device recovers the key with the same signature.
2. The `AccountRegistration` typed data, for `/auth/onboard`. Onboarding an existing account gives that account again.
3. A message for the API-key request.

The credentials go to the `StorageAdapter` (encrypted `localStorage` by default). If Extended refuses the stored API key, the SDK removes the credentials, and the setup step appears again.

## Signing and execution

| Action | Signing method | What the SDK does |
| --- | --- | --- |
| Order placement, cancel, leverage | `stark` | Signs each Stark message of the step, writes the signatures into the request body, and sends the request with the API key. |
| Withdrawal | `stark` | Also writes the account's bridge address as the recipient and commits a Rhino.fi bridge quote. |
| Deposit | `evmTx` | Sends `approve` and `depositWithId` to the Rhino.fi bridge on Arbitrum from the user's wallet, with a bridge quote committed right before the deposit transaction. |

The SDK refuses a Stark message that spends from another position, and a deposit transaction to an address that is not Extended's bridge contract.

Extended's own WebAssembly signer (`@x10xchange/stark-crypto-wrapper-wasm`) calculates the Stark keys, hashes, and signatures. The binary ships in `wasm/`, and the build checks that the ESM and CJS builds load it and sign.

## WebSocket

`extendedWsProvider()` uses Extended's v2 stream: one connection for all subscriptions. It streams the market context, the order book, trades, candles, and the account channels (`orderUpdates`, `fills`, `positions`, `accountSummary`). The account subscription carries the API key in the subscribe message, so a browser can open it.

## Not supported

- Spot markets.
- `spotBalances` and `availableToTrade` streams.
- Funding payments in `getActivity`.
- Deposits from a chain other than Arbitrum One.
