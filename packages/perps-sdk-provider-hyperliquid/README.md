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

## Ledger asset identity

Transfers carry the backend registry `Asset`, including its logo, numeric `id`,
and optional `wireId` and `l1Address`. Hyperliquid spot ledger tokens use
`NAME:tokenId`. The mapper joins only `tokenId` to `Asset.wireId`; it never
matches `NAME` to a display symbol. Bare protocol `USDC` resolves by reserved
spot token index `0`. Missing identities raise a stale or mis-keyed registry
error. The mapper never fabricates an asset or drops an unresolved transfer.

The fixed-USDC `deposit` and `withdraw` deltas resolve the registry `Asset`
by reserved spot token index `0`. Their `usdc` field identifies the venue's
collateral, not an arbitrary token. Consumers read `asset.displaySymbol` and
`asset.logoURI` on every ledger activity without a string exception.
`Fee.asset` remains a display string.

### Hyperliquid ledger coverage

The following table enumerates the ledger variants in the
[primary WebSocket definitions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions#data-type-definitions).
The [exchange API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
also documents `sendAsset`. Its ledger wire type is `send`.
The [spot metadata API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot)
defines token indices and `tokenId`.

| Delta | Activity or explicit exclusion |
| --- | --- |
| `spotTransfer` | Transfer between distinct accounts; resolve the token wire ID. |
| `send` | Transfer between distinct accounts; resolve the token wire ID or reserved USDC identity. |
| `internalTransfer` | USDC transfer between distinct accounts; resolve token index `0`. |
| `subAccountTransfer` | USDC transfer between master and subaccount addresses; resolve token index `0`. |
| `deposit` | Deposit with the USDC registry asset at token index `0`. |
| `withdraw` | Withdrawal with the USDC registry asset at token index `0`. |
| `liquidation` | Liquidation with resolved positions. |
| `accountClassTransfer` | Excluded: `toPerp` describes a spot/perp movement within one account, not a counterparty transfer. |
| `vaultCreate` | Excluded: vault creation and capital allocation require a vault activity model. |
| `vaultDeposit` | Outbound USDC transfer to the vault; resolve token index `0` and use `usdc`. |
| `vaultDistribution` | Excluded: a vault distribution requires vault identity and investment semantics. |
| `vaultWithdraw` | USDC transfer from the vault to the user; use `netWithdrawnUsd` and preserve accounting fields in `meta`. |
| `vaultLeaderCommission` | Excluded: commission income is not a transfer instruction and lacks a source counterparty. |
| `spotGenesis` | Excluded: token allocation has no source counterparty. |
| `rewardsClaim` | Excluded: reward income has no source counterparty. |

Vault withdrawal direction follows the queried account: inbound for the user,
outbound for the vault. The documented `vaultDeposit` payload has no depositor
field. A query for the vault account therefore raises `ValidationError` for that
row instead of inventing a counterparty. Depositor-account queries map normally.

The mapper excludes same-account movements in the transfer variants.
Unknown future delta types remain outside the supported activity model.
These exclusions do not apply to missing assets in supported transfer rows:
the mapper rejects those rows with an error instead of silently omitting them.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface and the agent signing model
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
