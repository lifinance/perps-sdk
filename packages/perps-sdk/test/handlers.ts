import type {
  AccountResponse,
  ActivitiesResponse,
  CreateActionResponse,
  ExecuteActionResponse,
  FillsResponse,
  Market,
  MarketDisplay,
  MarketsResponse,
  Meta,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  OrdersResponse,
  PerpsMarketDisplay,
  PositionsResponse,
  PricesResponse,
  ProvidersResponse,
  TermsAcceptanceStatus,
} from '@lifi/perps-types'
import {
  ActionType,
  ActivityType,
  FillClassification,
  FillStatus,
  LiquidityRole,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsSigner,
  PositionMarginAdjustment,
  PositionSide,
  SigningMethod,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { DEFAULT_API_URL } from '../src/client/createPerpsClient.js'

const BASE_URL = DEFAULT_API_URL

// Shared BTC market identity reused by the position/order/fill/activity
// fixtures below — those response shapes embed a `MarketDisplay` (or the
// perps-specific superset) rather than a flat symbol/assetId/provider triad.
const BTC_MARKET_DISPLAY: MarketDisplay = {
  providerId: 'hyperliquid',
  id: 'BTC',
  categoryId: 'hyperliquid',
  baseAsset: {
    providerId: 'hyperliquid',
    id: 'BTC',
    displaySymbol: 'BTC',
    logoURI: 'https://example.com/btc.png',
  },
  quoteAsset: {
    providerId: 'hyperliquid',
    id: 'USDC',
    displaySymbol: 'USDC',
    logoURI: 'https://example.com/usdc.png',
  },
}
const BTC_PERPS_MARKET_DISPLAY: PerpsMarketDisplay = {
  ...BTC_MARKET_DISPLAY,
  positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
}

export const mockProviders: ProvidersResponse = {
  providers: [
    {
      key: 'hyperliquid',
      name: 'Hyperliquid',
      logoURI: 'https://example.com/hl.png',
      signingMethod: SigningMethod.EIP712,
      active: true,
      // `setup` gates trading — Hyperliquid requires the user to authorise
      // the SDK session signer and the LI.FI builder fee before placing
      // orders. Both are zero-parameter user-approval descriptors.
      setup: [
        {
          type: ActionType.APPROVE_AGENT,
          title: 'Approve agent wallet',
          description:
            'Authorises the SDK session signer to place orders on your behalf.',
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
          params: [],
        },
        {
          type: ActionType.APPROVE_BUILDER_FEE,
          title: 'Approve builder fee',
          description: 'Authorises the LI.FI builder fee for this provider.',
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
          params: [],
        },
      ],
      // `options` exposes post-setup tunables — Hyperliquid's account-mode
      // selector. Agent-signed so the SDK can auto-upgrade after
      // APPROVE_AGENT when abstraction has never been set.
      options: [
        {
          type: ActionType.ACCOUNT_MODE,
          title: 'Account mode',
          description: 'Choose how this account interacts with Hyperliquid.',
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.EIP712,
          params: [
            {
              name: 'mode',
              type: 'string',
              values: [
                { value: 'disabled', label: 'Standard' },
                { value: 'dexAbstraction', label: 'Dex abstraction' },
                { value: 'unifiedAccount', label: 'Unified account' },
              ],
              default: { value: 'dexAbstraction', label: 'Dex abstraction' },
            },
          ],
        },
      ],
      actions: [
        {
          type: ActionType.PLACE_ORDER,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.CANCEL_ORDER,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.MODIFY_ORDER,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.UPDATE_POSITION_MARGIN,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.WITHDRAWAL,
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.SEND_ASSET,
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
        },
      ],
      categories: [],
      supportedIntervals: [],
    },
    {
      key: 'lighter',
      name: 'Lighter',
      logoURI: 'https://example.com/lighter.png',
      signingMethod: SigningMethod.WASM_BLOB,
      active: true,
      // Lighter registers an API key via a WASM blob whose user-consent leg is
      // an EIP-191 message — no agent, no EIP712. Self-describing setup step.
      setup: [
        {
          type: ActionType.REGISTER_API_KEY,
          title: 'Register API key',
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.WASM_BLOB,
          params: [],
        },
      ],
      options: [
        {
          type: ActionType.ACCOUNT_TYPE,
          title: 'Account tier',
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.WASM_BLOB,
          params: [],
        },
      ],
      actions: [
        {
          type: ActionType.PLACE_ORDER,
          signers: [PerpsSigner.SDK],
          signingMethod: SigningMethod.WASM_BLOB,
        },
      ],
      categories: [],
      supportedIntervals: [],
    },
  ],
}

export const mockMeta: Meta = {
  version: '1.4.2',
  notices: [
    {
      timestamp: 1735689600000,
      title: 'Scheduled maintenance',
      message: 'Trading paused 02:00–03:00 UTC for an upgrade.',
      link: 'https://status.li.fi/maintenance',
    },
    {
      timestamp: 1735603200000,
      title: 'New market listed',
      message: 'PEPE-USD is now available for trading.',
    },
  ],
}

const TERMS_CONTENT =
  'LI.FI Perps Terms of Service v3\n\nBy using this service you agree to the following terms…'

export const mockTermsAccepted: TermsAcceptanceStatus = {
  termsVersion: '3',
  content: TERMS_CONTENT,
  accepted: true,
  acceptedAt: 1735689600000,
}

export const mockTermsNotAccepted: TermsAcceptanceStatus = {
  termsVersion: '3',
  content: TERMS_CONTENT,
  accepted: false,
}

export const mockCreateAcceptTermsResponse: CreateActionResponse = {
  actions: [
    {
      action: ActionType.META_ACCEPT_TERMS,
      typedData: {
        domain: { name: 'LIFI Perps', version: '1', chainId: 1 },
        types: {
          AcceptTerms: [
            { name: 'action', type: 'string' },
            { name: 'acceptor', type: 'address' },
            { name: 'termsVersion', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
          ],
        },
        primaryType: 'AcceptTerms',
        message: {
          action: 'Accept LI.FI Perps Terms of Service v3',
          acceptor: '0x1234567890123456789012345678901234567890',
          termsVersion: '3',
          timestamp: 1700000000000,
        },
      },
    },
  ],
}

export const mockMarkets: MarketsResponse = {
  markets: [
    {
      providerId: 'hyperliquid',
      id: 'BTC',
      categoryId: 'hyperliquid',
      baseAsset: {
        providerId: 'hyperliquid',
        id: 'BTC',
        displaySymbol: 'BTC',
        logoURI: 'https://example.com/btc.png',
      },
      quoteAsset: {
        providerId: 'hyperliquid',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
      },
      szDecimals: 5,
      maxLeverage: 50,
      onlyIsolated: false,
      positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
    },
    {
      providerId: 'hyperliquid',
      id: 'ETH',
      categoryId: 'hyperliquid',
      baseAsset: {
        providerId: 'hyperliquid',
        id: 'ETH',
        displaySymbol: 'ETH',
        logoURI: 'https://example.com/eth.png',
      },
      quoteAsset: {
        providerId: 'hyperliquid',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
      },
      szDecimals: 4,
      maxLeverage: 50,
      onlyIsolated: false,
      positionMarginAdjustment: PositionMarginAdjustment.ADD_AND_REMOVE,
    },
  ] satisfies Market[],
}

export const mockPrices: PricesResponse = {
  prices: [
    {
      marketId: 'BTC',
      midPrice: '95000.00',
      markPrice: '95010.00',
      oraclePrice: '95005.00',
    },
    {
      marketId: 'ETH',
      midPrice: '3400.00',
      markPrice: '3401.00',
      oraclePrice: '3400.50',
    },
  ],
}

export const mockOhlcv: OhlcvResponse = {
  provider: 'hyperliquid',
  marketId: 'BTC',
  interval: '1h',
  candles: [
    {
      t: 1704063600000,
      o: '94000',
      h: '95000',
      l: '93500',
      c: '94800',
      v: '100',
    },
    {
      t: 1704067200000,
      o: '94800',
      h: '95500',
      l: '94500',
      c: '95000',
      v: '120',
    },
  ],
}

export const mockOrderbook: OrderbookResponse = {
  provider: 'hyperliquid',
  marketId: 'BTC',
  bids: [
    { price: '94999.50', size: '1.5' },
    { price: '94999.00', size: '2.0' },
  ],
  asks: [
    { price: '95000.50', size: '1.0' },
    { price: '95001.00', size: '1.5' },
  ],
  timestamp: 1704067200000,
}

export const mockAccount: AccountResponse = {
  provider: 'hyperliquid',
  address: '0x1234567890123456789012345678901234567890',
  // Non-collateral holdings are empty in this fixture; the account's USDC
  // sits in `collateralBalances` as the hyperliquid venue's margin asset.
  balances: [],
  collateralBalances: [
    {
      categoryId: 'hyperliquid',
      asset: {
        providerId: 'hyperliquid',
        id: 'USDC',
        displaySymbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
      },
      units: '10000.00',
      valueUsd: '10000.00',
    },
  ],
  positions: [],
  marginUsed: '500.00',
  unrealizedPnl: '125.50',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  // Typed Hyperliquid account-config. `abstractionMode: null` means
  // abstraction has never been set (a fresh account) — most tests
  // override this via `mockAbstractionStatus` to exercise specific
  // branches.
  config: {
    provider: 'hyperliquid',
    abstractionMode: null,
    agents: [],
  },
}

export const mockPositions: PositionsResponse = {
  provider: 'hyperliquid',
  positions: [
    {
      market: BTC_PERPS_MARKET_DISPLAY,
      side: PositionSide.LONG,
      size: '0.1',
      entryPrice: '94000.00',
      markPrice: '95000.00',
      liquidationPrice: '85000.00',
      unrealizedPnl: '100.00',
      leverage: 10,
      marginUsed: '940.00',
      initialMarginRequirement: '940.00',
      marginMode: MarginMode.CROSS,
    },
  ],
  pagination: { limit: 100, hasMore: false },
}

export const mockOrders: OrdersResponse = {
  provider: 'hyperliquid',
  openOrders: [
    {
      orderId: 'order1',
      market: BTC_MARKET_DISPLAY,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.05',
      price: '93000.00',
      filledSize: '0',
      reduceOnly: false,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ],
  triggerOrders: [],
  pagination: { limit: 100, hasMore: false },
}

export const mockFills: FillsResponse = {
  provider: 'hyperliquid',
  items: [
    {
      id: 'hist1',
      orderId: 'order1',
      market: BTC_MARKET_DISPLAY,
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '94000.00',
      status: FillStatus.FILLED,
      liquidity: LiquidityRole.TAKER,
      classification: FillClassification.OPENED_LONG,
      filledSize: '0.1',
      fee: '4.70',
      realizedPnl: null,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ],
  pagination: { limit: 50, hasMore: false },
}

export const mockActivity: ActivitiesResponse = {
  provider: 'hyperliquid',
  items: [
    {
      id: '0xdep1',
      provider: 'hyperliquid',
      timestamp: '2024-01-01T00:00:00.000Z',
      type: ActivityType.DEPOSIT,
      amount: '5000.00',
    },
    {
      id: '0xfund1',
      provider: 'hyperliquid',
      timestamp: '2023-12-31T23:00:00.000Z',
      type: ActivityType.FUNDING,
      market: BTC_MARKET_DISPLAY,
      amount: '2.50',
      positionSize: '0.1',
      fundingRate: '0.0001',
    },
  ],
  pagination: { limit: 50, hasMore: false },
}

export const mockOrder: Order = {
  orderId: 'order1',
  market: BTC_MARKET_DISPLAY,
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  price: '93000.00',
  originalSize: '0.05',
  remainingSize: '0.05',
  filledSize: '0',
  status: OrderStatus.OPEN,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

export const mockCreateAuthResponse: CreateActionResponse = {
  actions: [
    {
      action: ActionType.APPROVE_AGENT,
      typedData: {
        domain: { name: 'Hyperliquid', chainId: 1 },
        types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
        primaryType: 'HyperliquidTransaction:ApproveAgent',
        message: { agent: '0xabcd' },
      },
    },
  ],
}

export const mockAuthResponse: ExecuteActionResponse = {
  results: [{ action: ActionType.APPROVE_AGENT, success: true }],
}

export const mockCreateOrderResponse: CreateActionResponse = {
  actions: [
    {
      action: ActionType.PLACE_ORDER,
      typedData: {
        domain: {
          name: 'Exchange',
          version: '1',
          chainId: 1337,
          verifyingContract: '0x0000000000000000000000000000000000000000',
        },
        types: {
          Agent: [
            { name: 'source', type: 'string' },
            { name: 'connectionId', type: 'bytes32' },
          ],
        },
        primaryType: 'Agent',
        message: {
          source: 'a',
          connectionId: `0x${'ab'.repeat(32)}`,
          nonce: 1700000000000,
        },
      },
    },
  ],
}

export const mockCancelOrderResponse: CreateActionResponse = {
  actions: [
    {
      action: ActionType.CANCEL_ORDER,
      typedData: {
        domain: {
          name: 'Exchange',
          version: '1',
          chainId: 1337,
          verifyingContract: '0x0000000000000000000000000000000000000000',
        },
        types: {
          Agent: [
            { name: 'source', type: 'string' },
            { name: 'connectionId', type: 'bytes32' },
          ],
        },
        primaryType: 'Agent',
        message: {
          source: 'a',
          connectionId: `0x${'cd'.repeat(32)}`,
          nonce: 1700000000000,
        },
      },
    },
  ],
}

export const mockSubmitOrderResponse: ExecuteActionResponse = {
  results: [
    {
      action: ActionType.PLACE_ORDER,
      success: true,
      orderId: 'neworder123',
    },
  ],
}

export const mockCreateWithdrawalResponse: CreateActionResponse = {
  actions: [
    {
      action: ActionType.WITHDRAWAL,
      typedData: {
        domain: {
          name: 'HyperliquidSignTransaction',
          version: '1',
          chainId: 42161,
          verifyingContract: '0x0000000000000000000000000000000000000000',
        },
        types: {
          'HyperliquidTransaction:Withdraw': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'destination', type: 'string' },
            { name: 'amount', type: 'string' },
            { name: 'time', type: 'uint64' },
          ],
        },
        primaryType: 'HyperliquidTransaction:Withdraw',
        message: {
          hyperliquidChain: 'Mainnet',
          destination: '0x1234567890123456789012345678901234567890',
          amount: '10',
          time: 1700000000000,
        },
      },
    },
  ],
}

export const mockSubmitWithdrawalResponse: ExecuteActionResponse = {
  results: [
    {
      action: ActionType.WITHDRAWAL,
      success: true,
    },
  ],
}

export const handlers = [
  // Market data
  http.get(`${BASE_URL}/providers`, () => HttpResponse.json(mockProviders)),

  http.get(`${BASE_URL}/meta`, () => HttpResponse.json(mockMeta)),

  http.get(`${BASE_URL}/meta/terms`, () =>
    HttpResponse.json(mockTermsNotAccepted)
  ),

  http.get(`${BASE_URL}/markets`, () => HttpResponse.json(mockMarkets)),

  http.get(`${BASE_URL}/markets/:symbol`, ({ params }) => {
    const market = mockMarkets.markets.find((m) => m.id === params.symbol)
    if (!market) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json(market)
  }),

  http.get(`${BASE_URL}/marketsContext`, () => HttpResponse.json(mockPrices)),

  http.get(`${BASE_URL}/ohlcv`, () => HttpResponse.json(mockOhlcv)),

  http.get(`${BASE_URL}/orderbook`, () => HttpResponse.json(mockOrderbook)),

  // Account
  http.get(`${BASE_URL}/account`, () => HttpResponse.json(mockAccount)),

  http.get(`${BASE_URL}/positions`, () => HttpResponse.json(mockPositions)),

  http.get(`${BASE_URL}/orders`, () => HttpResponse.json(mockOrders)),

  http.get(`${BASE_URL}/fills`, () => HttpResponse.json(mockFills)),

  http.get(`${BASE_URL}/activity`, () => HttpResponse.json(mockActivity)),

  http.get(`${BASE_URL}/order/:id`, () => HttpResponse.json(mockOrder)),

  // Actions (create & execute)
  http.post(`${BASE_URL}/createAction`, () =>
    HttpResponse.json(mockCreateOrderResponse)
  ),

  http.post(`${BASE_URL}/executeAction`, () =>
    HttpResponse.json(mockSubmitOrderResponse)
  ),
]

export const server = setupServer(...handlers)
