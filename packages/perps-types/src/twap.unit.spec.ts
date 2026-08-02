import { describe, expect, it } from 'vitest'
import type {
  ActionParamsMap,
  CancelTwapOrderParams,
  CreateActionRequest,
  ExecuteActionRequest,
  PlaceTwapOrderParams,
  TwapOrder,
} from './action.js'
import { ActionType, OrderSide, OrderType, TwapOrderStatus } from './enums.js'
import type { Param } from './providers.js'

// Type-layer contract for TWAP orders (ORD-1160). TWAP is modelled as
// distinct action types advertised per provider — not a new branch inside
// `placeOrder` — because the four active venues reach TWAP through three
// different wire mechanisms.
type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

// Both TWAP actions resolve their params through ActionParamsMap — the
// enforced gate that keeps CreateActionRequest / ExecuteActionRequest
// mapped types compiling.
type _PlaceTwapParams = Expect<
  Equals<ActionParamsMap[ActionType.PLACE_TWAP_ORDER], PlaceTwapOrderParams>
>
type _CancelTwapParams = Expect<
  Equals<ActionParamsMap[ActionType.CANCEL_TWAP_ORDER], CancelTwapOrderParams>
>

// ActionType is never wider than keyof ActionParamsMap — the TWAP actions
// ride the generic createAction/executeAction path.
type _ActionTypeCoveredByParamsMap = Expect<
  ActionType extends keyof ActionParamsMap ? true : false
>

// Narrowing the create request on the TWAP actions yields exactly the
// matching params shape — `Equals` catches both "too wide" and "too narrow".
type _CreatePlaceTwapParams = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.PLACE_TWAP_ORDER }
    >['params'],
    PlaceTwapOrderParams
  >
>
type _CreateCancelTwapParams = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.CANCEL_TWAP_ORDER }
    >['params'],
    CancelTwapOrderParams
  >
>

// The `action` discriminator narrows to the corresponding literal on both
// request unions.
type _CreateActionFieldNarrows = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.PLACE_TWAP_ORDER }
    >['action'],
    ActionType.PLACE_TWAP_ORDER
  >
>
type _ExecuteActionFieldNarrows = Expect<
  Equals<
    Extract<
      ExecuteActionRequest,
      { action: ActionType.CANCEL_TWAP_ORDER }
    >['action'],
    ActionType.CANCEL_TWAP_ORDER
  >
>

// The generic core of PlaceTwapOrderParams is required; every
// capability-declared extra (randomize — Hyperliquid; frequencySeconds /
// minPrice / maxPrice — Ondo) stays optional.
type RequiredKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K
}[keyof T]
type _PlaceTwapRequiredCore = Expect<
  Equals<
    RequiredKeys<PlaceTwapOrderParams>,
    'market' | 'side' | 'size' | 'durationSeconds'
  >
>
type _PlaceTwapExtrasOptional = Expect<
  Equals<
    Extract<
      RequiredKeys<PlaceTwapOrderParams>,
      'reduceOnly' | 'randomize' | 'frequencySeconds' | 'minPrice' | 'maxPrice'
    >,
    never
  >
>

// CancelTwapOrderParams carries the market plus the stringified
// provider-native TWAP id — nothing else.
type _CancelTwapKeys = Expect<
  Equals<keyof CancelTwapOrderParams, 'market' | 'twapId'>
>
type _CancelTwapIdIsString = Expect<
  Equals<CancelTwapOrderParams['twapId'], string>
>

// The TwapOrder read model exposes exactly the running-TWAP query surface;
// `avgFillPrice` is absent until the first child fill.
type _TwapOrderKeys = Expect<
  Equals<
    keyof TwapOrder,
    | 'id'
    | 'market'
    | 'side'
    | 'totalSize'
    | 'filledSize'
    | 'avgFillPrice'
    | 'startedAt'
    | 'durationSeconds'
    | 'status'
  >
>
type _TwapOrderStatusField = Expect<
  Equals<TwapOrder['status'], TwapOrderStatus>
>
type _TwapOrderAvgFillPriceOptional = Expect<
  Equals<Extract<RequiredKeys<TwapOrder>, 'avgFillPrice'>, never>
>

export type _TypeAssertions = [
  _PlaceTwapParams,
  _CancelTwapParams,
  _ActionTypeCoveredByParamsMap,
  _CreatePlaceTwapParams,
  _CreateCancelTwapParams,
  _CreateActionFieldNarrows,
  _ExecuteActionFieldNarrows,
  _PlaceTwapRequiredCore,
  _PlaceTwapExtrasOptional,
  _CancelTwapKeys,
  _CancelTwapIdIsString,
  _TwapOrderKeys,
  _TwapOrderStatusField,
  _TwapOrderAvgFillPriceOptional,
]

// Runtime smoke assertions back the type-level assertions for the
// `.unit.spec.ts` glob's vitest pass.
describe('TWAP action types', () => {
  it('uses the camelCase wire values matching the PLACE_ORDER/CANCEL_ORDER verb convention', () => {
    expect(ActionType.PLACE_TWAP_ORDER).toBe('placeTwapOrder')
    expect(ActionType.CANCEL_TWAP_ORDER).toBe('cancelTwapOrder')
  })

  it('does not collide with any existing ActionType value', () => {
    const values = Object.values(ActionType)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('PlaceTwapOrderParams', () => {
  it('accepts the generic core without extras', () => {
    const params: PlaceTwapOrderParams = {
      market: { marketId: 'BTC', categoryId: 'lighter' },
      side: OrderSide.BUY,
      size: '1.5',
      durationSeconds: 3600,
    }

    expect(params.randomize).toBeUndefined()
    expect(params.frequencySeconds).toBeUndefined()
  })

  it('accepts the Hyperliquid randomize extra', () => {
    const params: PlaceTwapOrderParams = {
      market: { marketId: 'BTC', categoryId: 'hyperliquid' },
      side: OrderSide.SELL,
      size: '0.25',
      durationSeconds: 1800,
      reduceOnly: true,
      randomize: true,
    }

    expect(params.randomize).toBe(true)
  })

  it('accepts the Ondo frequency and price-band extras', () => {
    const params: PlaceTwapOrderParams = {
      market: { marketId: 'ETH', categoryId: 'ondo' },
      side: OrderSide.BUY,
      size: '10',
      durationSeconds: 7200,
      frequencySeconds: 60,
      minPrice: '2400.5',
      maxPrice: '2600',
    }

    expect(params.frequencySeconds).toBe(60)
    expect(params.minPrice).toBe('2400.5')
  })
})

describe('CancelTwapOrderParams', () => {
  it('carries the stringified provider-native TWAP id', () => {
    // HL numeric twapId, Ondo `twap_`-prefixed id, and Lighter order-index
    // all travel as strings.
    const hl: CancelTwapOrderParams = {
      market: { marketId: 'BTC', categoryId: 'hyperliquid' },
      twapId: '12345',
    }
    const ondo: CancelTwapOrderParams = {
      market: { marketId: 'ETH', categoryId: 'ondo' },
      twapId: 'twap_abc123',
    }

    expect(hl.twapId).toBe('12345')
    expect(ondo.twapId).toBe('twap_abc123')
  })
})

describe('OrderType.TWAP', () => {
  it('is available read-side for venue order feeds', () => {
    expect(OrderType.TWAP).toBe('TWAP')
  })
})

describe('TwapOrderStatus', () => {
  it('covers the running-TWAP lifecycle', () => {
    expect(Object.values(TwapOrderStatus)).toEqual([
      'RUNNING',
      'COMPLETED',
      'CANCELLED',
    ])
  })
})

describe('Param descriptors for TWAP extras', () => {
  it('expresses a boolean toggle with a default (HL randomize)', () => {
    const randomize: Param = {
      name: 'randomize',
      type: 'boolean',
      default: { value: 'false', label: 'Off' },
    }

    expect(randomize.type).toBe('boolean')
    expect(randomize.default?.value).toBe('false')
  })

  it('expresses a numeric interval with allowed values (Ondo frequencySeconds)', () => {
    const frequencySeconds: Param = {
      name: 'frequencySeconds',
      type: 'number',
      values: [
        { value: '30', label: '30s' },
        { value: '60', label: '1m' },
        { value: '300', label: '5m' },
      ],
      default: { value: '60', label: '1m' },
    }

    expect(frequencySeconds.type).toBe('number')
    expect(frequencySeconds.values).toHaveLength(3)
  })
})
