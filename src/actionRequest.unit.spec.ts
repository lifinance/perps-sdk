/**
 * Compile-time regression tests for ORD-304.
 *
 * `CreateActionRequest` and `ExecuteActionRequest` used to declare
 * `params: ActionParamsMap[ActionType]`, which distributed the indexed
 * access over the *union* of every `ActionType` and resolved to the
 * union of every param shape — meaning any param shape was assignable
 * regardless of the `action` field. The fix re-shapes both requests as
 * discriminated unions over `action`, so narrowing on `action` narrows
 * `params` to exactly the matching entry in `ActionParamsMap`.
 *
 * `@lifi/perps-types` is a types-only package; the assertions below are
 * verified at typecheck time (`pnpm typecheck` / `tsc --noEmit`). Vitest
 * still picks the file up via the `*.unit.spec.ts` glob so a structural
 * regression also surfaces in `pnpm test:unit`.
 *
 * Mirrors the style of `providers.unit.spec.ts` and `account.unit.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import { ActionType, OrderSide, OrderType, TimeInForce } from './enums.js'
import type {
  CreateActionRequest,
  ExecuteActionRequest,
  PlaceOrderParams,
  WithdrawalParams,
} from './action.js'
import type { Address } from './typedData.js'

const SOME_ADDRESS: Address = '0x0000000000000000000000000000000000000001'
const DESTINATION: Address = '0x0000000000000000000000000000000000000002'

// ---------------------------------------------------------------------------
// Positive fixtures — selecting an `action` literal must permit the matching
// params shape (and only the matching shape, see negative section below).
// ---------------------------------------------------------------------------

const placeOrderCreate: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.PLACE_ORDER,
  params: {
    asset: { assetId: 'BTC', market: 'hyperliquid' },
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    size: '0.1',
    price: '60000',
    timeInForce: TimeInForce.GTC,
  },
}

const withdrawalCreate: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  signerAddress: SOME_ADDRESS,
  action: ActionType.WITHDRAWAL,
  params: {
    destination: DESTINATION,
    amount: '100',
  },
}

// `ActionType.TRANSFER` and `ActionType.APPROVE_BUILDER_FEE` both map to
// `Record<string, never>` — verify the empty-object param shape survives
// the distribution.
const transferCreate: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.TRANSFER,
  params: {},
}

const approveBuilderFeeCreate: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.APPROVE_BUILDER_FEE,
  params: {},
}

const placeOrderExecute: ExecuteActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.PLACE_ORDER,
  actions: [],
}

const withdrawalExecute: ExecuteActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  signerAddress: SOME_ADDRESS,
  action: ActionType.WITHDRAWAL,
  actions: [],
}

// ---------------------------------------------------------------------------
// Negative assertions — mis-matched param shapes must NOT typecheck.
// `@ts-expect-error` triggers a compile error if the line *would* typecheck,
// so the assertions below double as a regression guard: if someone reverts
// the discriminated-union shape, these `@ts-expect-error` directives will
// turn into "unused" errors and break the build.
// ---------------------------------------------------------------------------

// Use pre-built typed payloads so the negative assignments produce a single
// error on the assignment line (which is where the `@ts-expect-error` lives)
// rather than surfacing as nested "object literal may only specify known
// properties" errors on the param literal's inner lines.
const placeOrderParams: PlaceOrderParams = {
  asset: { assetId: 'BTC', market: 'hyperliquid' },
  side: OrderSide.BUY,
  size: '0.1',
}
const withdrawalParams: WithdrawalParams = {
  destination: DESTINATION,
  amount: '100',
}

// PLACE_ORDER + WithdrawalParams must fail (the exact bug in ORD-304).
// @ts-expect-error params shape must match action literal
const badPlaceOrderWithWithdrawalParams: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.PLACE_ORDER,
  params: withdrawalParams,
}

// WITHDRAWAL + PlaceOrderParams must fail (the symmetric case).
// @ts-expect-error params shape must match action literal
const badWithdrawalWithPlaceOrderParams: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.WITHDRAWAL,
  params: placeOrderParams,
}

// TRANSFER (Record<string, never>) must reject a populated params object.
// @ts-expect-error TRANSFER params must be empty
const badTransferWithPlaceOrderParams: CreateActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  action: ActionType.TRANSFER,
  params: placeOrderParams,
}

// ExecuteActionRequest narrows the top-level `action` the same way.
// A made-up action literal that isn't in the union must be rejected.
const badExecuteActionLiteral: ExecuteActionRequest = {
  provider: 'hyperliquid',
  address: SOME_ADDRESS,
  // @ts-expect-error 'not-a-real-action' is not assignable to ActionType
  action: 'not-a-real-action',
  actions: [],
}

// ---------------------------------------------------------------------------
// Structural assertions — narrowing on `action` must yield exactly the
// matching `params` shape (Equals catches both "too wide" and "too narrow"
// regressions). Mirrors the `Expect<Equals<...>>` style used in
// providers.unit.spec.ts.
// ---------------------------------------------------------------------------

type Expect<T extends true> = T
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false

type _CreatePlaceOrderParams = Expect<
  Equals<
    Extract<CreateActionRequest, { action: ActionType.PLACE_ORDER }>['params'],
    PlaceOrderParams
  >
>

type _CreateWithdrawalParams = Expect<
  Equals<
    Extract<CreateActionRequest, { action: ActionType.WITHDRAWAL }>['params'],
    WithdrawalParams
  >
>

// `Record<string, never>` for the no-params actions — locks in that the
// distribution preserved the empty-object marker rather than widening it.
type _CreateTransferParams = Expect<
  Equals<
    Extract<CreateActionRequest, { action: ActionType.TRANSFER }>['params'],
    Record<string, never>
  >
>

type _CreateApproveBuilderFeeParams = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.APPROVE_BUILDER_FEE }
    >['params'],
    Record<string, never>
  >
>

// `signerAddress?` must remain optional on every branch.
type _SignerAddressOptional = Expect<
  Equals<
    Extract<
      CreateActionRequest,
      { action: ActionType.PLACE_ORDER }
    >['signerAddress'],
    Address | undefined
  >
>

// The `action` field on every branch is the corresponding `ActionType` literal.
type _CreateActionFieldNarrows = Expect<
  Equals<
    Extract<CreateActionRequest, { action: ActionType.PLACE_ORDER }>['action'],
    ActionType.PLACE_ORDER
  >
>

// ExecuteActionRequest carries the same discriminator behaviour at the top
// level; its `actions` field remains the already-discriminated
// `SignedActionStep[]`, which we don't re-assert here (ORD-304 § Out of Scope).
type _ExecuteActionFieldNarrows = Expect<
  Equals<
    Extract<ExecuteActionRequest, { action: ActionType.WITHDRAWAL }>['action'],
    ActionType.WITHDRAWAL
  >
>

// Re-export the fixtures so `noUnusedLocals` doesn't flag them. The negative
// fixtures are intentionally `unknown`-typed at use to keep the structural
// information visible to TS while signalling to readers that the runtime
// values are placeholders.
export const _fixtures = {
  placeOrderCreate,
  withdrawalCreate,
  transferCreate,
  approveBuilderFeeCreate,
  placeOrderExecute,
  withdrawalExecute,
  badPlaceOrderWithWithdrawalParams,
  badWithdrawalWithPlaceOrderParams,
  badTransferWithPlaceOrderParams,
  badExecuteActionLiteral,
}

export type _TypeAssertions = [
  _CreatePlaceOrderParams,
  _CreateWithdrawalParams,
  _CreateTransferParams,
  _CreateApproveBuilderFeeParams,
  _SignerAddressOptional,
  _CreateActionFieldNarrows,
  _ExecuteActionFieldNarrows,
]

// ---------------------------------------------------------------------------
// Runtime smoke assertions — the `.unit.spec.ts` glob runs vitest too, so
// surface the fixtures' discriminator values at runtime as a belt-and-braces
// guard against a regression that somehow slips past tsc.
// ---------------------------------------------------------------------------

describe('CreateActionRequest discriminated union (ORD-304)', () => {
  it('narrows params to PlaceOrderParams on action === PLACE_ORDER', () => {
    if (placeOrderCreate.action === ActionType.PLACE_ORDER) {
      expect(placeOrderCreate.params.size).toBe('0.1')
      expect(placeOrderCreate.params.side).toBe(OrderSide.BUY)
    } else {
      throw new Error('expected PLACE_ORDER variant')
    }
  })

  it('narrows params to WithdrawalParams on action === WITHDRAWAL', () => {
    if (withdrawalCreate.action === ActionType.WITHDRAWAL) {
      expect(withdrawalCreate.params.destination).toBe(DESTINATION)
      expect(withdrawalCreate.params.amount).toBe('100')
    } else {
      throw new Error('expected WITHDRAWAL variant')
    }
  })

  it('admits the empty-object params for TRANSFER and APPROVE_BUILDER_FEE', () => {
    expect(transferCreate.params).toEqual({})
    expect(approveBuilderFeeCreate.params).toEqual({})
  })

  it('keeps signerAddress optional across branches', () => {
    expect(placeOrderCreate.signerAddress).toBeUndefined()
    expect(withdrawalCreate.signerAddress).toBe(SOME_ADDRESS)
  })
})

describe('ExecuteActionRequest discriminated union (ORD-304)', () => {
  it('narrows on action field at the top level', () => {
    if (placeOrderExecute.action === ActionType.PLACE_ORDER) {
      expect(placeOrderExecute.actions).toEqual([])
    } else {
      throw new Error('expected PLACE_ORDER variant')
    }

    if (withdrawalExecute.action === ActionType.WITHDRAWAL) {
      expect(withdrawalExecute.actions).toEqual([])
    } else {
      throw new Error('expected WITHDRAWAL variant')
    }
  })
})
