import { Type, type Static } from '@sinclair/typebox'

// ---------------------------------------------------------------------------
// Hyperliquid /info response schemas (TypeBox)
//
// Each schema produces both a JSON Schema object (for AJV validation) and a
// TypeScript type via Static<>. The derived types are structurally identical
// to the hand-written ones they replace.
//
// All schemas use additionalProperties: true (TypeBox default) so that new
// fields added by Hyperliquid pass through without breaking validation.
// ---------------------------------------------------------------------------

// -- metaAndAssetCtxs -------------------------------------------------------

export const HlUniverseItemSchema = Type.Object({
  name: Type.String(),
  szDecimals: Type.Number(),
  maxLeverage: Type.Number(),
  onlyIsolated: Type.Boolean(),
  isDelisted: Type.Boolean(),
})
export type HlUniverseItem = Static<typeof HlUniverseItemSchema>

export const HlMetaSchema = Type.Object({
  universe: Type.Array(HlUniverseItemSchema),
})
export type HlMeta = Static<typeof HlMetaSchema>

export const HlAssetCtxSchema = Type.Object({
  funding: Type.String(),
  openInterest: Type.String(),
  dayNtlVlm: Type.String(),
  markPx: Type.String(),
})
export type HlAssetCtx = Static<typeof HlAssetCtxSchema>

export const HlMetaAndAssetCtxsSchema = Type.Tuple([
  HlMetaSchema,
  Type.Array(HlAssetCtxSchema),
])
export type HlMetaAndAssetCtxs = Static<typeof HlMetaAndAssetCtxsSchema>

export type HlUniverse = HlMeta['universe']

// -- allMids ----------------------------------------------------------------

export const HlAllMidsSchema = Type.Record(Type.String(), Type.String())
export type HlAllMids = Static<typeof HlAllMidsSchema>

// -- candleSnapshot ---------------------------------------------------------

export const HlCandleSchema = Type.Object({
  t: Type.Number(),
  o: Type.String(),
  h: Type.String(),
  l: Type.String(),
  c: Type.String(),
  v: Type.String(),
})
export type HlCandle = Static<typeof HlCandleSchema>

export const HlCandleSnapshotSchema = Type.Array(HlCandleSchema)
export type HlCandleSnapshot = Static<typeof HlCandleSnapshotSchema>

// -- l2Book -----------------------------------------------------------------

export const HlLevelSchema = Type.Object({
  px: Type.String(),
  sz: Type.String(),
  n: Type.Number(),
})
export type HlLevel = Static<typeof HlLevelSchema>

export const HlL2BookSchema = Type.Object({
  levels: Type.Tuple([Type.Array(HlLevelSchema), Type.Array(HlLevelSchema)]),
  time: Type.Number(),
})
export type HlL2Book = Static<typeof HlL2BookSchema>

// -- clearinghouseState -----------------------------------------------------

export const HlPositionSchema = Type.Object({
  coin: Type.String(),
  szi: Type.String(),
  entryPx: Type.String(),
  positionValue: Type.String(),
  liquidationPx: Type.String(),
  unrealizedPnl: Type.String(),
  marginUsed: Type.String(),
  leverage: Type.Object({
    type: Type.String(),
    value: Type.Number(),
  }),
})
export type HlPosition = Static<typeof HlPositionSchema>

export const HlAssetPositionSchema = Type.Object({
  position: HlPositionSchema,
})
export type HlAssetPosition = Static<typeof HlAssetPositionSchema>

export const HlClearinghouseStateSchema = Type.Object({
  assetPositions: Type.Array(HlAssetPositionSchema),
  marginSummary: Type.Object({
    accountValue: Type.String(),
    totalMarginUsed: Type.String(),
  }),
  crossMarginSummary: Type.Object({
    accountValue: Type.String(),
    totalMarginUsed: Type.String(),
  }),
})
export type HlClearinghouseState = Static<typeof HlClearinghouseStateSchema>

// -- spotClearinghouseState -------------------------------------------------

export const HlSpotBalanceSchema = Type.Object({
  coin: Type.String(),
  token: Type.Number(),
  total: Type.String(),
  hold: Type.String(),
  entryNtl: Type.String(),
})
export type HlSpotBalance = Static<typeof HlSpotBalanceSchema>

export const HlSpotClearinghouseStateSchema = Type.Object({
  balances: Type.Array(HlSpotBalanceSchema),
})
export type HlSpotClearinghouseState = Static<
  typeof HlSpotClearinghouseStateSchema
>

// -- userFees ---------------------------------------------------------------

export const HlUserFeesSchema = Type.Object({
  userAddRate: Type.String(),
  userCrossRate: Type.String(),
  activeReferralDiscount: Type.String(),
})
export type HlUserFees = Static<typeof HlUserFeesSchema>

// -- frontendOpenOrders -----------------------------------------------------

export const HlFrontendOpenOrderSchema = Type.Object({
  oid: Type.Number(),
  coin: Type.String(),
  side: Type.String(),
  sz: Type.String(),
  limitPx: Type.String(),
  orderType: Type.String(),
  origSz: Type.String(),
  reduceOnly: Type.Boolean(),
  timestamp: Type.Number(),
})
export type HlFrontendOpenOrder = Static<typeof HlFrontendOpenOrderSchema>

export const HlFrontendOpenOrdersSchema = Type.Array(
  HlFrontendOpenOrderSchema
)
export type HlFrontendOpenOrders = Static<typeof HlFrontendOpenOrdersSchema>

// -- extraAgents ------------------------------------------------------------

export const HlExtraAgentsSchema = Type.Array(
  Type.Record(Type.String(), Type.Unknown())
)
export type HlExtraAgents = Static<typeof HlExtraAgentsSchema>

// -- userFills / userFillsByTime --------------------------------------------

export const HlUserFillSchema = Type.Object({
  tid: Type.Number(),
  coin: Type.String(),
  side: Type.String(),
  sz: Type.String(),
  px: Type.String(),
  dir: Type.String(),
  fee: Type.String(),
  closedPnl: Type.String(),
  time: Type.Number(),
})
export type HlUserFill = Static<typeof HlUserFillSchema>

export const HlUserFillsSchema = Type.Array(HlUserFillSchema)
export type HlUserFills = Static<typeof HlUserFillsSchema>

export const HlUserFillsByTimeSchema = Type.Array(HlUserFillSchema)
export type HlUserFillsByTime = Static<typeof HlUserFillsByTimeSchema>

// -- orderStatus ------------------------------------------------------------

export const HlOrderDetailSchema = Type.Object({
  order: Type.Object({
    oid: Type.Number(),
    coin: Type.String(),
    side: Type.String(),
    sz: Type.String(),
    limitPx: Type.String(),
    orderType: Type.String(),
    origSz: Type.String(),
    reduceOnly: Type.Boolean(),
    timestamp: Type.Number(),
    tif: Type.Union([Type.String(), Type.Null()]),
    cloid: Type.Union([Type.String(), Type.Null()]),
    triggerCondition: Type.String(),
    triggerPx: Type.Union([Type.String(), Type.Null()]),
  }),
  status: Type.String(),
  statusTimestamp: Type.Number(),
})
export type HlOrderDetail = Static<typeof HlOrderDetailSchema>

export const HlOrderStatusFoundSchema = Type.Object({
  status: Type.Literal('order'),
  order: HlOrderDetailSchema,
})
export type HlOrderStatusFound = Static<typeof HlOrderStatusFoundSchema>

export const HlOrderStatusResponseSchema = Type.Union([
  HlOrderStatusFoundSchema,
  Type.Object({ status: Type.Literal('unknownOid') }),
])
export type HlOrderStatusResponse = Static<
  typeof HlOrderStatusResponseSchema
>

// -- perpDexs ---------------------------------------------------------------

export const HlPerpDexsSchema = Type.Array(
  Type.Union([Type.Null(), Type.Object({ name: Type.String() })])
)
export type HlPerpDexs = Static<typeof HlPerpDexsSchema>

// ---------------------------------------------------------------------------
// Exchange request / response schemas
// ---------------------------------------------------------------------------

export const HlExchangeRequestSchema = Type.Object({
  action: Type.Record(Type.String(), Type.Unknown()),
  signature: Type.Object({
    r: Type.String(),
    s: Type.String(),
    v: Type.Number(),
  }),
  nonce: Type.Number(),
  vaultAddress: Type.Optional(Type.Union([Type.String(), Type.Null()])),
})
export type HlExchangeRequest = Static<typeof HlExchangeRequestSchema>

export const HlExchangeResponseSchema = Type.Object({
  status: Type.String(),
  response: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Object({
        type: Type.String(),
        data: Type.Optional(
          Type.Object({
            statuses: Type.Optional(
              Type.Array(
                Type.Union([
                  Type.String(),
                  Type.Object({
                    filled: Type.Object({
                      totalSz: Type.String(),
                      avgPx: Type.String(),
                      oid: Type.Number(),
                    }),
                  }),
                  Type.Object({ resting: Type.Object({ oid: Type.Number() }) }),
                  Type.Object({
                    waitingForFill: Type.Object({ oid: Type.Number() }),
                  }),
                  Type.Object({
                    waitingForTrigger: Type.Object({ oid: Type.Number() }),
                  }),
                  Type.Object({ success: Type.Literal(true) }),
                  Type.Object({ error: Type.String() }),
                ])
              )
            ),
            status: Type.Optional(Type.Unknown()),
          })
        ),
      }),
    ])
  ),
})
export type HlExchangeResponse = Static<typeof HlExchangeResponseSchema>
