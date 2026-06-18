<div align="center">

[![license](https://img.shields.io/github/license/lifinance/perps-sdk)](/LICENSE)
[![npm latest package](https://img.shields.io/npm/v/@lifi/perps-sdk-provider-hyperliquid/latest.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![npm downloads](https://img.shields.io/npm/dm/@lifi/perps-sdk-provider-hyperliquid.svg)](https://www.npmjs.com/package/@lifi/perps-sdk-provider-hyperliquid)
[![Follow on Twitter](https://img.shields.io/twitter/follow/lifiprotocol.svg?label=follow+LI.FI)](https://twitter.com/lifiprotocol)

</div>

# `@lifi/perps-sdk-provider-hyperliquid`

Hyperliquid provider plugin for [`@lifi/perps-sdk`](https://www.npmjs.com/package/@lifi/perps-sdk) — a workspace package of the [`perps-sdk`](https://www.npmjs.com/package/@lifi/perps-sdk) monorepo. Register it on a `PerpsClient` to trade Hyperliquid perpetuals through the SDK's unified interface.

```bash
pnpm add @lifi/perps-sdk @lifi/perps-sdk-provider-hyperliquid
```

```ts
import { createPerpsClient } from '@lifi/perps-sdk'
import { hyperliquidProvider } from '@lifi/perps-sdk-provider-hyperliquid'

const client = createPerpsClient({
  integrator: 'my-app',
  apiKey: 'your-api-key',
  providers: [hyperliquidProvider()],
})
```

See the [`@lifi/perps-sdk` README](https://www.npmjs.com/package/@lifi/perps-sdk) and the [full documentation](https://public-perps-docs.mintlify.app/) for setup, options, the exported surface, and the agent signing model.
