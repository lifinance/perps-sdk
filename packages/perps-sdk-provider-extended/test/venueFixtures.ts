import { readFileSync } from 'node:fs'
import {
  PositionMarginAdjustment,
  type Provider,
  SigningMethod,
} from '@lifi/perps-types'

/** Raw body of a mainnet answer recorded from the test account (GET only). */
export const recordedBody = (
  name:
    | 'asset_operations'
    | 'balance'
    | 'leverage'
    | 'orders_history'
    | 'trades'
): string =>
  readFileSync(
    new URL(`./fixtures/venue/${name}.json`, import.meta.url),
    'utf8'
  )

/** Serialize like Extended: ids as JSON numbers, digits kept. */
export const venueBody = (data: unknown): string =>
  JSON.stringify({ status: 'OK', data }).replace(
    /"__id:(\d+)"/g,
    (_match, digits: string) => digits
  )

/** Mark an id that `venueBody` writes as a JSON number above 2^53. */
export const bigId = (digits: string): string => `__id:${digits}`

export const COLLATERAL_ASSET = {
  providerId: 'extended',
  id: 'USDC',
  displaySymbol: 'USDC',
  displayName: 'USD Coin',
  logoURI: '',
}

export const PROVIDER_METADATA: Provider = {
  key: 'extended',
  name: 'Extended',
  logoURI: '',
  signingMethod: SigningMethod.STARK,
  active: true,
  setup: [],
  actions: [],
  supportedIntervals: [],
  fundingHistoryRanges: [],
  categories: [{ id: 'extended', quoteAsset: COLLATERAL_ASSET }],
}

const market = (id: string, base: string, tick: string, lot: string) => ({
  providerId: 'extended',
  id,
  categoryId: 'extended',
  baseAsset: {
    providerId: 'extended',
    id: base,
    displaySymbol: base,
    logoURI: '',
  },
  quoteAsset: COLLATERAL_ASSET,
  szDecimals: lot.split('.')[1]?.length ?? 0,
  priceDecimals: tick.split('.')[1]?.length ?? 0,
  priceIncrement: tick,
  sizeIncrement: lot,
  markPrice: '64000',
  maxLeverage: 50,
  onlyIsolated: false,
  positionMarginAdjustment: PositionMarginAdjustment.NONE,
  maintenanceMarginRate: '0.01',
  funding: { rate: '0.00001', nextFundingTime: 0 },
})

/** The backend markets: ids are the Extended market names. */
export const MARKETS_RESPONSE = {
  markets: [
    market('BTC-USD', 'BTC', '1', '0.00001'),
    market('RECALL-USD', 'RECALL', '0.000001', '1'),
  ],
}

/** An open position with the documented `GET /user/positions` fields. */
export const OPEN_POSITION = {
  id: bigId('2123010000000000001'),
  accountId: 330870,
  market: 'BTC-USD',
  side: 'LONG',
  leverage: '10',
  size: '0.01',
  value: '640',
  openPrice: '60000',
  markPrice: '64000',
  liquidationPrice: '54500',
  margin: '64',
  unrealisedPnl: '40',
  realisedPnl: '-0.15',
  paidFundingFee: '0',
  createdTime: 1794990000000,
  updatedTime: 1794998000000,
}

/** Open TPSL and conditional orders with the documented order fields. */
export const OPEN_ORDERS = [
  {
    id: bigId('2123010000000000002'),
    accountId: 330870,
    externalId: 'ua-tpsl',
    market: 'BTC-USD',
    type: 'TPSL',
    side: 'SELL',
    status: 'UNTRIGGERED',
    qty: '0.01',
    filledQty: '0',
    reduceOnly: true,
    tpSlType: 'POSITION',
    takeProfit: {
      triggerPrice: '70000',
      triggerPriceType: 'MARK',
      price: '69900',
      priceType: 'LIMIT',
    },
    stopLoss: {
      triggerPrice: '58000',
      triggerPriceType: 'MARK',
      price: '57000',
      priceType: 'MARKET',
    },
    timeInForce: 'GTT',
    createdTime: 1794990000000,
    updatedTime: 1794990000000,
    expireTime: 1797582000000,
  },
  {
    id: bigId('2123010000000000003'),
    accountId: 330870,
    externalId: 'ua-stop',
    market: 'BTC-USD',
    type: 'CONDITIONAL',
    side: 'BUY',
    status: 'UNTRIGGERED',
    price: '66100',
    qty: '0.002',
    trigger: {
      triggerPrice: '66000',
      triggerPriceType: 'LAST',
      triggerPriceDirection: 'UP',
      executionPriceType: 'LIMIT',
    },
    timeInForce: 'GTT',
    createdTime: 1794990000000,
    updatedTime: 1794990000000,
    expireTime: 1797582000000,
  },
]
