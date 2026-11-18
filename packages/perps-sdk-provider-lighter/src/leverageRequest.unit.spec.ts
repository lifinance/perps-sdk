import { PerpsClient } from '@lifi/perps-sdk'
import {
  ActionRelay,
  ActionType,
  MarginMode,
  OrderSide,
  OrderType,
  PerpsErrorCode,
  PerpsSigner,
  type PlaceOrderParams,
  SigningMethod,
  type UpdateLeverageParams,
} from '@lifi/perps-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIGHTER_PROVIDER_KEY, LIGHTER_RH_PROVIDER_KEY } from './constants.js'
import { lighterProvider, lighterRhProvider } from './LighterProvider.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const API_URL = 'https://backend.test/v1/perps'
const MARKET = { marketId: '1', categoryId: 'lighter' }

const descriptor = (type: ActionType) => ({
  type,
  signer: PerpsSigner.SDK,
  signingMethod: SigningMethod.WASM_BLOB,
  relay: ActionRelay.API,
  params: [],
})

const PROVIDERS_RESPONSE = {
  providers: [LIGHTER_PROVIDER_KEY, LIGHTER_RH_PROVIDER_KEY].map((key) => ({
    key,
    categories: [],
    setup: [],
    actions: [
      descriptor(ActionType.UPDATE_LEVERAGE),
      descriptor(ActionType.PLACE_ORDER),
    ],
  })),
}

/** Every body posted to `createAction`, in order. */
let createActionBodies: Record<string, unknown>[] = []

beforeEach(() => {
  createActionBodies = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u === `${API_URL}/providers`) {
        return Response.json(PROVIDERS_RESPONSE)
      }
      if (u === `${API_URL}/createAction`) {
        createActionBodies.push(JSON.parse(String(init?.body)))
        return Response.json({ actions: [] })
      }
      throw new Error(`Unhandled URL in test: ${u}`)
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([
  {
    label: 'lighterProvider()',
    factory: lighterProvider,
    key: LIGHTER_PROVIDER_KEY,
  },
  {
    label: 'lighterRhProvider()',
    factory: lighterRhProvider,
    key: LIGHTER_RH_PROVIDER_KEY,
  },
])('$label — native IMF on the createAction request', ({ factory, key }) => {
  const client = () =>
    new PerpsClient({
      integrator: 'leverage-request-test',
      apiKey: 'test-key',
      apiUrl: API_URL,
      providers: [factory()],
    })

  const updateLeverage = (
    params: Partial<UpdateLeverageParams>
  ): Promise<unknown> =>
    client().buildAction(ActionType.UPDATE_LEVERAGE, {
      provider: key,
      address: ADDRESS,
      params: { market: MARKET, leverage: 15, ...params },
    })

  const placeOrder = (params: Partial<PlaceOrderParams>): Promise<unknown> =>
    client().buildAction(ActionType.PLACE_ORDER, {
      provider: key,
      address: ADDRESS,
      params: {
        market: MARKET,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        size: '1',
        ...params,
      },
    })

  it.each([
    [15, '667'],
    [14.9, '671'],
    [3, '3333'],
    [1, '10000'],
  ])('encodes a new leverage choice %s as IMF %s', async (leverage, imf) => {
    await updateLeverage({ leverage, marginMode: MarginMode.CROSS })

    expect(createActionBodies).toEqual([
      {
        provider: key,
        address: ADDRESS,
        action: ActionType.UPDATE_LEVERAGE,
        params: {
          market: MARKET,
          leverage,
          marginMode: MarginMode.CROSS,
          initialMarginFractionBps: imf,
        },
      },
    ])
  })

  it('forwards the reported IMF unchanged on a settings-preserving write', async () => {
    // The two-decimal 14.29x would encode to 700 here, but 6.67x encodes to
    // 1499: the native source wins so a margin-mode change keeps IMF 1500.
    await updateLeverage({
      leverage: 6.67,
      marginMode: MarginMode.ISOLATED,
      initialMarginFractionBps: '1500',
    })

    expect(createActionBodies[0]).toMatchObject({
      params: { leverage: 6.67, initialMarginFractionBps: '1500' },
    })
  })

  it('never carries an older IMF into a new leverage choice', async () => {
    await updateLeverage({ leverage: 14.29, initialMarginFractionBps: '700' })
    await updateLeverage({ leverage: 15 })

    expect(
      createActionBodies.map(
        ({ params }) =>
          (params as Record<string, unknown>).initialMarginFractionBps
      )
    ).toEqual(['700', '667'])
  })

  it('encodes the leverage of an order that sets a new leverage', async () => {
    await placeOrder({ leverage: 15 })

    expect(createActionBodies[0]).toMatchObject({
      action: ActionType.PLACE_ORDER,
      params: { leverage: 15, initialMarginFractionBps: '667' },
    })
  })

  it('forwards the reported IMF of an order at the current leverage', async () => {
    await placeOrder({ leverage: 14.29, initialMarginFractionBps: '700' })

    expect(createActionBodies[0]).toMatchObject({
      params: { leverage: 14.29, initialMarginFractionBps: '700' },
    })
  })

  it('forwards a native-only order source without a leverage multiple', async () => {
    await placeOrder({ initialMarginFractionBps: '700' })

    expect(createActionBodies[0]).toMatchObject({
      params: { initialMarginFractionBps: '700' },
    })
    expect(createActionBodies[0]).not.toHaveProperty('params.leverage')
  })

  it('sends no IMF on an order without leverage fields', async () => {
    await placeOrder({})

    expect(createActionBodies[0]).not.toHaveProperty(
      'params.initialMarginFractionBps'
    )
  })

  it.each([
    '0',
    '-1',
    '6.67',
    '',
    'abc',
  ])('rejects the unusable native IMF %j before any request', async (initialMarginFractionBps) => {
    await expect(
      updateLeverage({ initialMarginFractionBps })
    ).rejects.toMatchObject({ code: PerpsErrorCode.ValidationError })
    expect(createActionBodies).toEqual([])
  })

  it.each([
    0, -1, 30000,
  ])('rejects the leverage %s that encodes no positive IMF before any request', async (leverage) => {
    await expect(updateLeverage({ leverage })).rejects.toMatchObject({
      code: PerpsErrorCode.ValidationError,
    })
    expect(createActionBodies).toEqual([])
  })
})
