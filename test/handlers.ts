import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import type {
  AccountResponse,
  AuthorizationsResponse,
  CancelOrderPayloadResponse,
  CreateAuthorizationResponse,
  CreateOrderResponse,
  DexesResponse,
  HistoryResponse,
  MarketsResponse,
  OhlcvResponse,
  Order,
  OrderbookResponse,
  PricesResponse,
  SubmitOrderResponse,
} from '../src/types/perps.js'
import {
  HistoryItemStatus,
  MarginMode,
  OrderActionType,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
} from '../src/types/perps.js'

const BASE_URL = 'https://li.quest/v1/perps'
const HEALTH_URL = 'https://li.quest/health/live'

export const mockDexes: DexesResponse = {
  dexes: [
    {
      key: 'hyperliquid',
      name: 'Hyperliquid',
      logoURI: 'https://example.com/hl.png',
      authorizations: [
        { key: 'ApproveAgent', name: 'Approve Agent', params: [] },
        { key: 'ApproveBuilderFee', name: 'Approve Builder Fee', params: [] },
      ],
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
      dex: 'hyperliquid',
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
      dex: 'hyperliquid',
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
  dex: 'hyperliquid',
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
  dex: 'hyperliquid',
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
  dex: 'hyperliquid',
  address: '0x1234567890123456789012345678901234567890',
  balances: [{ currency: 'USDC', amount: '10000.00' }],
  marginUsed: '500.00',
  unrealizedPnl: '125.50',
  feeTier: { maker: '0.0002', taker: '0.0005' },
  positions: [
    {
      symbol: 'BTC',
      assetId: 0,
      dex: 'hyperliquid',
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
  openOrders: [
    {
      id: 'order1',
      symbol: 'BTC',
      assetId: 0,
      dex: 'hyperliquid',
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.05',
      price: '93000.00',
      filledSize: '0',
      reduceOnly: false,
      createdAt: '2024-01-01T00:00:00Z',
    },
  ],
  config: {},
}

export const mockHistory: HistoryResponse = {
  dex: 'hyperliquid',
  items: [
    {
      id: 'hist1',
      symbol: 'BTC',
      assetId: 0,
      dex: 'hyperliquid',
      side: OrderSide.BUY,
      type: OrderType.MARKET,
      size: '0.1',
      price: '94000.00',
      status: HistoryItemStatus.FILLED,
      filledSize: '0.1',
      fee: '4.70',
      realizedPnl: null,
      createdAt: '2024-01-01T00:00:00Z',
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

export const mockCreateAuthResponse: CreateAuthorizationResponse = {
  actions: [
    {
      action: 'ApproveAgent',
      description: 'Approve agent wallet',
      typedData: {
        domain: { name: 'Hyperliquid', chainId: 1 },
        types: { ApproveAgent: [{ name: 'agent', type: 'address' }] },
        primaryType: 'HyperliquidTransaction:ApproveAgent',
        message: { agent: '0xabcd' },
      },
    },
  ],
}

export const mockAuthResponse: AuthorizationsResponse = {
  results: [{ action: 'ApproveAgent', success: true }],
}

export const mockCreateOrderResponse: CreateOrderResponse = {
  actions: [
    {
      action: OrderActionType.PLACE_ORDER,
      description: 'Place limit order',
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

export const mockCancelOrderResponse: CancelOrderPayloadResponse = {
  actions: [
    {
      action: OrderActionType.CANCEL_ORDER,
      description: 'Cancel order',
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

export const mockSubmitOrderResponse: SubmitOrderResponse = {
  results: [
    {
      action: OrderActionType.PLACE_ORDER,
      success: true,
      orderId: 'neworder123',
    },
  ],
}

export const handlers = [
  // Health
  http.get(HEALTH_URL, () => HttpResponse.json({ status: 'OK' })),

  // Market data
  http.get(`${BASE_URL}/dexes`, () => HttpResponse.json(mockDexes)),

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

  http.get(`${BASE_URL}/history`, () => HttpResponse.json(mockHistory)),

  http.get(`${BASE_URL}/order/:id`, () => HttpResponse.json(mockOrder)),

  // Authorization
  http.post(`${BASE_URL}/createAuthorization`, () =>
    HttpResponse.json(mockCreateAuthResponse)
  ),

  http.post(`${BASE_URL}/authorization`, () =>
    HttpResponse.json(mockAuthResponse)
  ),

  // Trading
  http.post(`${BASE_URL}/createOrder`, () =>
    HttpResponse.json(mockCreateOrderResponse)
  ),

  http.post(`${BASE_URL}/cancelOrder`, () =>
    HttpResponse.json(mockCancelOrderResponse)
  ),

  http.post(`${BASE_URL}/order`, () =>
    HttpResponse.json(mockSubmitOrderResponse)
  ),
]

export const server = setupServer(...handlers)
