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

## API key storage

Setup registers an API key user-side; the bundled WASM signer uses it to sign orders locally. Key material is persisted through a `StorageAdapter` — the default adapter encrypts values with AES-GCM before writing to browser `localStorage`, holding the master key as a non-extractable `CryptoKey` handle in IndexedDB, so key material is never stored as plaintext. Pass `storage` to use another backend:

```ts
lighterProvider({ storage: myStorageAdapter })
```

## Referral and read authentication

The `SET_REFERRAL` action uses a short-lived standard token. After the action confirms the code, the provider stores the code with the local API key. `getAccount` compares this marker with the current provider code to set `referralPresent`. It does not send a read-only token to a referral endpoint.

Before `getAccount` starts an authenticated read, it compares the local public key with the registered Lighter public key. A missing or different key prevents token creation and authenticated reads. If Lighter returns code `61006` for a read-only token, the provider creates one replacement and retries the read once. Responses with HTTP `401`, HTTP `403`, or code `20013` do not remove or replace the token.

Each provider instance shares one request hold across its Lighter API clients, polls, and token-management requests. An HTTP `429` or HTTP `405` response starts the hold. The provider uses `Retry-After` when Lighter supplies it. Otherwise, the hold lasts 60 seconds. All Lighter requests from that provider fail before network dispatch until the hold expires. Separate provider instances do not share a hold.

## WASM signer loading

The Go signer binary ships as a separate asset and the package resolves it itself. The ESM build points a static `new URL('../../wasm/lighter-signer.wasm', import.meta.url)` at it, which webpack, Turbopack and Vite production builds rewrite into an emitted asset URL, while Node reads the installed binary from disk. The loader checks the WASM preamble of whatever the URL serves; if a bundler relocated the module — Vite's dependency optimizer rewrites the package into `.vite/deps`, leaving the static URL pointing at the cache directory — it re-resolves through that bundler's own asset pipeline. Go's `wasm_exec.js` is packaged as generated text and evaluated as-is.

Applications need no `optimizeDeps.exclude`, no `?url`/`?raw` imports, no `public/` copy step, no caller-supplied URL and no bundler configuration. `loadLighterWasm()` is exported for hosts that want to warm the signer up (and its 12.9 MB download) before the user's first trade:

```ts
import { loadLighterWasm } from '@lifi/perps-sdk-provider-lighter'

await loadLighterWasm()
```

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface, the auth-token model, and the browser/Vite WASM configuration
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
