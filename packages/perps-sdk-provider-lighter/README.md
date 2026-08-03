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
  integrator: 'my-app',
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

## WASM signer loading

The Go signer binary ships as a separate asset and the package resolves it itself: the ESM build points a static `new URL('../../wasm/lighter-signer.wasm', import.meta.url)` at it, which Vite and Next.js rewrite into an emitted asset URL, while Node reads the installed binary from disk. Go's `wasm_exec.js` is packaged as generated text and evaluated as-is. Applications need no `?url`/`?raw` imports, no `public/` copy step, and no bundler configuration.

## Documentation

- [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) — client setup, options, and the WebSocket API
- [Full documentation](https://public-perps-docs.mintlify.app/) — the exported surface, the auth-token model, and the browser/Vite WASM configuration
- [API reference](https://public-perps-docs.mintlify.app/api-reference)
- [Source and issues](https://github.com/lifinance/perps-sdk)
