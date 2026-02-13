# @lifi/perps-sdk

TypeScript SDK for the LI.FI Perps API. Trade perpetuals across multiple DEXes with a unified interface.

## Prerequisites

This package depends on `@lifi/perps-types`, which lives in a sibling directory (`../perps-types`). Make sure you have it cloned locally before building:

```bash
git clone <perps-types-repo-url> ../perps-types
cd ../perps-types && npm install && npm run build
```

## Installation

```bash
npm install @lifi/perps-sdk
# or
pnpm add @lifi/perps-sdk
# or
yarn add @lifi/perps-sdk
```

## Quick Start

```typescript
import {
  createPerpsClient,
  getDexes,
  getMarkets,
  PerpsClient,
  OrderSide,
  OrderType,
} from '@lifi/perps-sdk'

// 1. Create a client (required before any API calls)
const client = createPerpsClient({
  integrator: 'my-app',
  apiKey: 'optional-api-key', // Optional
})

// 2. Fetch market data (no authentication required)
const { dexes } = await getDexes(client)
const { markets } = await getMarkets(client, { dex: 'hyperliquid' })
```

## Architecture

The SDK has two layers:

### 1. Service Functions (Low-Level)

Stateless functions for direct API calls. Every service function takes the `client` as its first argument. Use these when you want explicit control over signing:

```typescript
import {
  createPerpsClient,
  createOrder,
  submitOrder,
  getAccount,
  getPrices,
  OrderSide,
  OrderType,
} from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app' })

// Create order payloads
const { actions } = await createOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  symbol: 'BTC',
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  size: '0.1',
  price: '94000.00',
})

// Sign with user's wallet
const signedActions = await Promise.all(
  actions.map(async (a) => ({
    action: a.action,
    typedData: a.typedData,
    signature: await walletClient.signTypedData(a.typedData),
  }))
)

// Submit
const result = await submitOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  actions: signedActions,
})
```

### 2. PerpsClient (High-Level)

Stateful client that manages signing modes and agent keys. Use this for the best UX:

```typescript
import { PerpsClient, OrderSide, OrderType } from '@lifi/perps-sdk'

const perps = new PerpsClient({ integrator: 'my-app' })
```

## Signing Modes

| Mode | Who Signs | UX |
|------|-----------|-----|
| `USER` | User wallet (MetaMask, etc.) | Popup per order |
| `USER_AGENT` | SDK-generated agent key | No popups after setup |

### USER Mode

Every order requires a wallet signature popup:

```typescript
// USER mode is the default, no need to set explicitly
// perps.setSigningMode(userAddress, 'hyperliquid', 'USER')

// 1. Build order (signerAddress auto-injected as userAddress)
const { actions } = await perps.buildOrder({
  address: userAddress,
  dex: 'hyperliquid',
  symbol: 'BTC',
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  size: '0.1',
  price: '94000.00',
})

// 2. Sign with user's wallet
const signedActions = await Promise.all(
  actions.map(async (a) => ({
    action: a.action,
    typedData: a.typedData,
    signature: await walletClient.signTypedData(a.typedData),
  }))
)

// 3. Submit (signerAddress auto-injected)
await perps.submitSignedOrder({
  dex: 'hyperliquid',
  address: userAddress,
  actions: signedActions,
})
```

### USER_AGENT Mode (Recommended for Active Trading)

One-time authorization, then seamless trading:

```typescript
// 1. Set up agent signing
await perps.setSigningMode(userAddress, 'hyperliquid', 'USER_AGENT')

// 2. Check which authorizations are needed
const required = await perps.getRequiredAuthorizations({
  dex: 'hyperliquid',
  address: userAddress,
})

if (!required.isReady) {
  // 3. Build authorization payloads for user to sign
  const { actions } = await perps.buildAuthorization({
    dex: 'hyperliquid',
    address: userAddress,
    authorizations: required.userAuthorizations,
  })

  // 4. User signs the authorizations with their wallet
  const signedActions = await Promise.all(
    actions.map(async (a) => ({
      action: a.action,
      typedData: a.typedData,
      signature: await walletClient.signTypedData(a.typedData),
    }))
  )

  // 5. Submit user-signed actions (+ auto-signs agent authorizations)
  await perps.executeAuthorizations({
    dex: 'hyperliquid',
    address: userAddress,
    required,
    userSignedActions: signedActions,
  })
}

// 6. Place orders (agent signs automatically - no wallet popups!)
const result = await perps.placeOrder({
  address: userAddress,
  dex: 'hyperliquid',
  symbol: 'BTC',
  side: OrderSide.BUY,
  type: OrderType.MARKET,
  size: '0.1',
  price: '95000.00',
  leverage: 10,
})

// 7. Cancel orders (also automatic)
await perps.cancelOrders({
  address: userAddress,
  dex: 'hyperliquid',
  ids: ['order1', 'order2'],
})
```

## API Reference

### Market Data (No Auth Required)

```typescript
import {
  createPerpsClient,
  getDexes,
  getMarkets,
  getMarket,
  getPrices,
  getOhlcv,
  getOrderbook,
} from '@lifi/perps-sdk'

const client = createPerpsClient({ integrator: 'my-app' })

// Get available DEXes
const { dexes } = await getDexes(client)

// Get markets for a DEX
const { markets } = await getMarkets(client, { dex: 'hyperliquid' })

// Get a specific market
const market = await getMarket(client, { dex: 'hyperliquid', symbol: 'BTC' })

// Get prices
const { prices } = await getPrices(client, { dex: 'hyperliquid' })
const filtered = await getPrices(client, { dex: 'hyperliquid', symbols: ['BTC', 'ETH'] })

// Get OHLCV candles
const { candles } = await getOhlcv(client, {
  dex: 'hyperliquid',
  symbol: 'BTC',
  interval: '1h',
  limit: 100,
})

// Get orderbook
const { bids, asks } = await getOrderbook(client, {
  dex: 'hyperliquid',
  symbol: 'BTC',
  depth: 20,
})
```

### Account Data

```typescript
import { getAccount, getHistory, getOrder } from '@lifi/perps-sdk'

// Get account info (balances, positions, open orders)
const account = await getAccount(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
})

// Get order history
const { items, pagination } = await getHistory(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  limit: 50,
})

// Get specific order
const order = await getOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  id: 'order123',
})
```

### Authorization

```typescript
import { createAuthorization, submitAuthorization } from '@lifi/perps-sdk'

// Create authorization payloads
const { actions } = await createAuthorization(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  authorizations: [
    { key: 'ApproveAgent', params: { agentAddress: '0xabcd...' } },
    { key: 'ApproveBuilderFee' },
  ],
})

// Submit signed authorizations
const { results } = await submitAuthorization(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  actions: signedActions,
})
```

### Trading

```typescript
import { createOrder, cancelOrder, submitOrder, OrderSide, OrderType, TimeInForce } from '@lifi/perps-sdk'

// Create order payloads
const { actions } = await createOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  symbol: 'BTC',
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  size: '0.1',
  price: '94000.00',
  leverage: 10,
  timeInForce: TimeInForce.GTC,
})

// Create cancel payloads
const { actions: cancelActions } = await cancelOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  ids: ['order1', 'order2'],
})

// Submit signed order/cancel actions
const { results } = await submitOrder(client, {
  dex: 'hyperliquid',
  address: '0x1234...',
  actions: signedActions,
})
```

## PerpsClient Methods

### Agent Management

| Method | Description |
|--------|-------------|
| `setSigningMode(address, dex, mode)` | Set signing mode (`'USER'` or `'USER_AGENT'`). Generates agent keypair in USER_AGENT mode. |
| `getSigningMode(address, dex)` | Get current signing mode. Defaults to `'USER'`. |
| `getAgentAddress(address, dex)` | Get the agent's wallet address. |
| `hasAgent(address, dex)` | Check if an agent keypair exists. |
| `removeAgent(address, dex)` | Remove agent and reset to USER mode. |

### Authorization

| Method | Description |
|--------|-------------|
| `buildAuthorization(params)` | Build authorization payloads. Auto-injects agent address in USER_AGENT mode. |
| `submitAuthorizations(params)` | Submit user-signed authorization actions. |
| `getRequiredAuthorizations(params)` | Check which authorizations are needed before trading. Returns `{ isReady, userAuthorizations, agentAuthorizations }`. |
| `executeAuthorizations(params)` | Submit user-signed actions and auto-sign agent authorizations in one call. |

### Trading

| Method | Description |
|--------|-------------|
| `buildOrder(params)` | Build order payloads for manual signing. |
| `buildCancelOrder(params)` | Build cancel payloads for manual signing. |
| `placeOrder(params)` | Build, sign, and submit an order automatically. **Requires USER_AGENT mode.** |
| `cancelOrders(params)` | Build, sign, and submit a cancel automatically. **Requires USER_AGENT mode.** |
| `submitSignedOrder(params)` | Submit pre-signed order actions (for USER mode). |

### Properties

| Property | Description |
|----------|-------------|
| `client` | Access the underlying `PerpsSDKClient` for use with service functions. |
| `ready` | Promise that resolves when the API health check passes. |

## Custom Storage

By default, agent keys are stored in `localStorage`. For server-side or custom storage:

```typescript
import { PerpsClient, createMemoryStorage } from '@lifi/perps-sdk'

// In-memory storage (for testing or server-side)
const perps = new PerpsClient({
  integrator: 'my-app',
  storage: createMemoryStorage(),
})

// Custom storage adapter
const perps = new PerpsClient({
  integrator: 'my-app',
  storage: {
    get: async (key) => myStore.get(key),
    set: async (key, value) => myStore.set(key, value),
    remove: async (key) => myStore.delete(key),
  },
})
```

## Error Handling

```typescript
import {
  PerpsSDKError,
  PerpsError,
  HTTPError,
  ValidationError,
  AgentError,
  ServerError,
  PerpsErrorCode,
} from '@lifi/perps-sdk'

try {
  await perps.placeOrder(...)
} catch (error) {
  if (error instanceof PerpsSDKError) {
    // Top-level wrapper — all SDK errors are wrapped in this
    console.error(`SDK error [${error.code}]: ${error.message}`)
    console.error('Cause:', error.cause)
  }

  if (error instanceof HTTPError) {
    // HTTP request failures (4xx/5xx)
    console.error(`HTTP ${error.status}: ${error.message}`)
  } else if (error instanceof AgentError) {
    // Agent not found or unauthorized
    console.error('Agent issue:', error.message)
  } else if (error instanceof ValidationError) {
    // Invalid parameters or missing required fields
    console.error('Validation:', error.message)
  } else if (error instanceof ServerError) {
    // Network failures or timeouts
    console.error('Server:', error.message)
  } else if (error instanceof PerpsError) {
    // Base error class for all perps errors
    switch (error.code) {
      case PerpsErrorCode.InsufficientMargin:
        console.error('Not enough margin')
        break
      case PerpsErrorCode.AgentUnauthorized:
        console.error('Agent not authorized - need to approve first')
        break
      default:
        console.error(error.message)
    }
  }
}
```

## TypeScript Support

The SDK is fully typed. All types, interfaces, and enums are exported from the package entry point:

```typescript
import { OrderSide, OrderType, TimeInForce, PerpsErrorCode } from '@lifi/perps-sdk'
import type { Market, Order, Position, PerpsConfig } from '@lifi/perps-sdk'
```

## License

Apache-2.0
