import type {
  AccountResponse,
  ActivitiesResponse,
  CreateActionResponse,
  ExecuteActionResponse,
  FillsResponse,
  MarketsResponse,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  OrdersResponse,
  PositionsResponse,
  PricesResponse,
  ProvidersResponse,
} from '@lifi/perps-types'
import {
  ActionType,
  ActivityType,
  FillStatus,
  MarginMode,
  OrderSide,
  OrderStatus,
  OrderType,
  PerpsSigner,
  PositionSide,
  SigningMethod,
} from '@lifi/perps-types'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { DEFAULT_API_URL } from '../src/client/createPerpsClient.js'

const BASE_URL = DEFAULT_API_URL

export const mockProviders: ProvidersResponse = {
  providers: [
    {
      key: 'hyperliquid',
      name: 'Hyperliquid',
      logoURI: 'https://example.com/hl.png',
      signingMethod: SigningMethod.EIP712,
      active: true,
      accountConfiguration: [
        {
          type: ActionType.APPROVE_AGENT,
          title: 'Approve agent wallet',
          description:
            'Authorises the SDK session signer to place orders on your behalf.',
          optional: false,
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
          control: { type: 'user-approval' },
        },
        {
          type: ActionType.APPROVE_BUILDER_FEE,
          title: 'Approve builder fee',
          description: 'Authorises the LI.FI builder fee for this provider.',
          optional: false,
          signers: [PerpsSigner.USER],
          signingMethod: SigningMethod.EIP712,
          control: { type: 'user-approval' },
        },
        {
          type: ActionType.ACCOUNT_MODE,
          title: 'Account mode',
          description: 'Choose how this account interacts with Hyperliquid.',
          optional: true,
          signers: [PerpsSigner.AGENT],
          signingMethod: SigningMethod.EIP712,
          control: {
            type: 'multi-option',
            values: [
              { value: 'disabled', label: 'Standard' },
              {
                value: 'dexAbstraction',
                label: 'Dex abstraction',
                default: true,
              },
              { value: 'unifiedAccount', label: 'Unified account' },
            ],
          },
        },
      ],
      actions: [
        {
          type: ActionType.PLACE_ORDER,
          signers: [PerpsSigner.USER, PerpsSigner.AGENT],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.CANCEL_ORDER,
          signers: [PerpsSigner.USER, PerpsSigner.AGENT],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.MODIFY_ORDER,
          signers: [PerpsSigner.USER, PerpsSigner.AGENT],
          signingMethod: SigningMethod.EIP712,
        },
        {
          type: ActionType.UPDATE_POSITION_MARGIN,
          signers: [PerpsSigner.USER, PerpsSigner.AGENT],
          signingMethod: SigningMethod.EIP712,
        },
      ],
      markets: [],
    },
  ],
}

export const mockMarkets: MarketsResponse = {
  markets: [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      logoURI: 'https://example.com/btc.png',
      assetId: 0,
      provider: 'hyperliquid',
      szDecimals: 5,
      maxLeverage: 50,
      onlyIsolated: false,
      funding: { rate: '0.0001', nextFundingTime: 1704067200000 },
      markPrice: '95000.00',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      logoURI: 'https://example.com/eth.png',
      assetId: 1,
      provider: 'hyperliquid',
      szDecimals: 4,
      maxLeverage: 50,
      onlyIsolated: false,
      funding: { rate: '0.00005', nextFundingTime: 1704067200000 },
      markPrice: '3400.00',
    },
  ],
}

export const mockPrices: PricesResponse = {
  prices: {
    BTC: '95000.00',
    ETH: '3400.00',
  },
}

export const mockOhlcv: OhlcvResponse = {
  provider: 'hyperliquid',
  symbol: 'BTC',
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
  symbol: 'BTC',
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
  balances: [{ currency: 'USDC', amount: '10000.00' }],
  marginUsed: '500.00',
  unrealizedPnl: '125.50',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  config: {},
}

export const mockPositions: PositionsResponse = {
  provider: 'hyperliquid',
  positions: [
    {
      symbol: 'BTC',
      assetId: 0,
      provider: 'hyperliquid',
      side: PositionSide.LONG,
      size: '0.1',
      entryPrice: '94000.00',
      markPrice: '95000.00',
      liquidationPrice: '85000.00',
      unrealizedPnl: '100.00',
      leverage: 10,
      marginUsed: '940.00',
      marginMode: MarginMode.CROSS,
    },
  ],
  pagination: { limit: 100, hasMore: false },
}

export const mockOrders: OrdersResponse = {
  provider: 'hyperliquid',
  openOrders: [
    {
      id: 'order1',
      symbol: 'BTC',
      assetId: 0,
      provider: 'hyperliquid',
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
      symbol: 'BTC',
      assetId: 0,
      provider: 'hyperliquid',
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '94000.00',
      status: FillStatus.FILLED,
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
      symbol: 'BTC',
      amount: '2.50',
      positionSize: '0.1',
      fundingRate: '0.0001',
    },
  ],
  pagination: { limit: 50, hasMore: false },
}

export const mockOrder: Order = {
  orderId: 'order1',
  symbol: 'BTC',
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

export const handlers = [
  // Market data
  http.get(`${BASE_URL}/providers`, () => HttpResponse.json(mockProviders)),

  http.get(`${BASE_URL}/markets`, () => HttpResponse.json(mockMarkets)),

  http.get(`${BASE_URL}/markets/:symbol`, ({ params }) => {
    const market = mockMarkets.markets.find((m) => m.symbol === params.symbol)
    if (!market) {
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json(market)
  }),

  http.get(`${BASE_URL}/prices`, () => HttpResponse.json(mockPrices)),

  http.get(`${BASE_URL}/ohlcv/:symbol`, () => HttpResponse.json(mockOhlcv)),

  http.get(`${BASE_URL}/orderbook/:symbol`, () =>
    HttpResponse.json(mockOrderbook)
  ),

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
