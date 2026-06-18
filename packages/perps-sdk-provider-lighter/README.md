<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-lighter/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-lighter.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-lighter)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

# `@lifi/perps-sdk-provider-lighter`

Lighter provider plugin for [`@lifi/perps-sdk`](https://www.npmjs.com/package/@lifi/perps-sdk) — a workspace package of the [`perps-sdk`](https://www.npmjs.com/package/@lifi/perps-sdk) monorepo. Register it on a `PerpsClient` to trade Lighter perpetuals through the SDK's unified interface; signing runs through a bundled Go WASM signer.

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-lighter
```

```ts
import { createPerpsClient, localStorageAdapter } from '@lifi/perps-sdk'
import { LighterKeyStore, LighterSigner, lighterProvider } from '@lifi/perps-sdk-provider-lighter'

const client = createPerpsClient({
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [
    lighterProvider({
      signer: new LighterSigner(),
      keyStore: new LighterKeyStore(localStorageAdapter),
      readOnlyTokenOptions: { storage: localStorageAdapter },
    }),
  ],
})
```

See the [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) and the [full documentation](https://public-perps-docs.mintlify.app/) for setup, options, the exported surface, the auth-token model, and the browser/Vite WASM configuration.
