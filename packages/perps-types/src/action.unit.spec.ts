import { describe, expect, it } from 'vitest'
import type {
  ActionParamsMap,
  ActionResult,
  ApproveReadOnlyTokenParams,
  EvmCall,
  EvmTxActionStep,
  EvmTxSignedActionStep,
  PlaceOrderParams,
  UpdateLeverageParams,
} from './action.js'
import { ActionType, MarginMode, OrderSide, OrderType } from './enums.js'

// Locks in that `marginMode` is optional on `PlaceOrderParams` /
// `UpdateLeverageParams` and accepts both `MarginMode.CROSS` and
// `MarginMode.ISOLATED`. Pure type-level assertions; vitest still picks the
// file up via the `.unit.spec.ts` glob.
describe('PlaceOrderParams', () => {
  it('accepts a fixture without marginMode (optional field)', () => {
    const params: PlaceOrderParams = {
      market: { marketId: 'BTC', categoryId: 'lighter' },
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      size: '0.1',
      price: '60000',
    }

    expect(params.marginMode).toBeUndefined()
  })

  it('accepts marginMode: ISOLATED', () => {
    const params: PlaceOrderParams = {
      market: { marketId: 'BTC', categoryId: 'lighter' },
      side: OrderSide.BUY,
      size: '0.1',
      marginMode: MarginMode.ISOLATED,
    }

    expect(params.marginMode).toBe(MarginMode.ISOLATED)
  })

  it('accepts marginMode: CROSS', () => {
    const params: PlaceOrderParams = {
      market: { marketId: 'BTC', categoryId: 'hyperliquid' },
      side: OrderSide.SELL,
      size: '0.1',
      marginMode: MarginMode.CROSS,
    }

    expect(params.marginMode).toBe(MarginMode.CROSS)
  })
})

describe('UpdateLeverageParams', () => {
  it('accepts a fixture without marginMode (optional field)', () => {
    const params: UpdateLeverageParams = {
      market: { marketId: 'ETH', categoryId: 'lighter' },
      leverage: 10,
    }

    expect(params.marginMode).toBeUndefined()
  })

  it('accepts marginMode: ISOLATED', () => {
    const params: UpdateLeverageParams = {
      market: { marketId: 'ETH', categoryId: 'lighter' },
      leverage: 10,
      marginMode: MarginMode.ISOLATED,
    }

    expect(params.marginMode).toBe(MarginMode.ISOLATED)
  })

  it('accepts marginMode: CROSS', () => {
    const params: UpdateLeverageParams = {
      market: { marketId: 'ETH', categoryId: 'hyperliquid' },
      leverage: 5,
      marginMode: MarginMode.CROSS,
    }

    expect(params.marginMode).toBe(MarginMode.CROSS)
  })
})

describe('ApproveReadOnlyTokenParams', () => {
  it('accepts a fixture with scope "all"', () => {
    const params: ApproveReadOnlyTokenParams = {
      accountIndex: 42,
      expirySeconds: 1_999_999_999,
      scope: 'all',
    }

    expect(params.scope).toBe('all')
  })

  it('accepts a fixture with scope "single"', () => {
    const params: ApproveReadOnlyTokenParams = {
      accountIndex: 7,
      expirySeconds: 1_900_000_000,
      scope: 'single',
    }

    expect(params.scope).toBe('single')
  })

  it('is wired through ActionParamsMap on APPROVE_READ_ONLY_TOKEN', () => {
    type Resolved = ActionParamsMap[ActionType.APPROVE_READ_ONLY_TOKEN]
    const params: Resolved = {
      accountIndex: 1,
      expirySeconds: 1_800_000_000,
      scope: 'all',
    }

    expect(params.accountIndex).toBe(1)
  })
})

describe('ActionResult', () => {
  it('accepts a success fixture with orderId; success branch has no error', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      success: true,
      orderId: 'lighter-12345',
    }

    if (result.success) {
      expect(result.orderId).toBe('lighter-12345')
      // @ts-expect-error — `error` is not present on the success variant
      result.error
    } else {
      throw new Error('expected success branch')
    }
  })

  it('accepts a failure fixture with required error', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      success: false,
      error: 'order rejected',
    }

    if (!result.success) {
      expect(result.error).toBe('order rejected')
      // @ts-expect-error — `orderId` is not present on the failure variant
      result.orderId
    } else {
      throw new Error('expected failure branch')
    }
  })

  it('narrows the discriminated union on `success` so `error` is required only on the failure branch', () => {
    const results: ActionResult[] = [
      {
        action: ActionType.PLACE_ORDER,
        success: true,
        orderId: 'hl-1',
      },
      {
        action: ActionType.PLACE_ORDER,
        success: false,
        error: 'rejected',
      },
    ]

    const errors = results.flatMap((r) => (r.success ? [] : [r.error]))

    expect(errors).toEqual(['rejected'])
  })
})

describe('EvmCall / EVM_TX steps', () => {
  const call: EvmCall = {
    chainId: 42161,
    to: '0x2222222222222222222222222222222222222222',
    functionName: 'approve',
    args: ['0x3333333333333333333333333333333333333333', 100n],
    abi: ['function approve(address spender, uint256 amount) returns (bool)'],
  }

  it('types txParams as EvmCall so chainId/to/functionName/args/abi read without a cast', () => {
    const step: EvmTxActionStep = { action: ActionType.DEPOSIT, txParams: call }

    expect(step.txParams.chainId).toBe(42161)
    expect(step.txParams.to).toBe('0x2222222222222222222222222222222222222222')
    expect(step.txParams.functionName).toBe('approve')
    expect(step.txParams.args).toHaveLength(2)
    expect(step.txParams.abi[0]).toContain('approve')
  })

  it('does not carry a `step` field — the backend-emitted key is not part of the contract', () => {
    const withStep: EvmCall = {
      ...call,
      // @ts-expect-error — `step` is not part of EvmCall
      step: 1,
    }

    // @ts-expect-error — `step` is not a readable property of EvmCall
    withStep.step
  })

  it('EvmTxSignedActionStep carries the same EvmCall txParams plus a txHash', () => {
    const signed: EvmTxSignedActionStep = {
      action: ActionType.DEPOSIT,
      txParams: call,
      txHash: '0xdeadbeef',
    }

    expect(signed.txParams.chainId).toBe(42161)
    expect(signed.txHash).toBe('0xdeadbeef')
  })
})
