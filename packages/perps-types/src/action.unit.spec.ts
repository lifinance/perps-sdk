import { describe, expect, it } from 'vitest'
import type { Balance } from './account.js'
import type {
  ActionParamsMap,
  ActionResult,
  ActionStep,
  ApproveReadOnlyTokenParams,
  EvmCall,
  EvmTxActionStep,
  EvmTxSignedActionStep,
  HmacActionStep,
  HmacSignedActionStep,
  ModifyOrderInput,
  PlaceOrderParams,
  RevokeAgentParams,
  SessionActionStep,
  SignedActionStep,
  SiweActionStep,
  SiweSignedActionStep,
  TriggerOrderInput,
  UpdateLeverageParams,
  WithdrawalAssetRef,
  WithdrawalParams,
} from './action.js'
import { CHECK_ACCOUNT_BEFORE_RETRY_TEXT } from './action.js'
import {
  ActionType,
  MarginMode,
  OrderSide,
  OrderType,
  PerpsErrorCode,
  UserActionStatus,
} from './enums.js'

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

describe('TriggerOrderInput', () => {
  it('accepts a fixture without size (entire position)', () => {
    const leg: TriggerOrderInput = {
      type: OrderType.MARKET,
      triggerPrice: '65000',
    }

    expect(leg.size).toBeUndefined()
  })

  it('accepts a fixed partial size', () => {
    const leg: TriggerOrderInput = {
      type: OrderType.LIMIT,
      triggerPrice: '65000',
      limitPrice: '64900',
      size: '0.0876',
    }

    expect(leg.size).toBe('0.0876')
  })

  it('accepts a slippage-adjusted limitPrice on a market leg', () => {
    const leg: TriggerOrderInput = {
      type: OrderType.MARKET,
      triggerPrice: '65000',
      limitPrice: '63050',
    }

    expect(leg).toMatchObject({ type: OrderType.MARKET, limitPrice: '63050' })
  })
})

describe('ModifyOrderInput', () => {
  it('accepts a modification without type (optional field)', () => {
    const modification: ModifyOrderInput = {
      id: '12345',
      triggerPrice: '66000',
    }

    expect(modification.type).toBeUndefined()
  })

  it('accepts a type on a modified trigger', () => {
    const modification: ModifyOrderInput = {
      id: '12345',
      type: OrderType.LIMIT,
      triggerPrice: '66000',
      limitPrice: '65900',
    }

    expect(modification.type).toBe(OrderType.LIMIT)
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

describe('RevokeAgentParams', () => {
  it('takes no parameters', () => {
    const params: RevokeAgentParams = {}

    expect(params).toEqual({})
  })

  it('rejects the address and name the backend strips', () => {
    // @ts-expect-error — the backend revoke action accepts no params
    const params: RevokeAgentParams = { name: 'third-party-terminal' }

    expect(params.name).toBe('third-party-terminal')
  })

  it('is wired through ActionParamsMap on REVOKE_AGENT', () => {
    type Resolved = ActionParamsMap[ActionType.REVOKE_AGENT]
    const params: Resolved = {}

    expect(params).toEqual({})
  })
})

describe('WithdrawalParams', () => {
  it('accepts a source and opaque withdrawalOptions', () => {
    const params: WithdrawalParams = {
      destination: '0x1234567890123456789012345678901234567890',
      amount: '10',
      source: { categoryId: 'spot', asset: { id: '3' } },
      withdrawalOptions: { mode: 'standard' },
    }

    expect(params.source?.categoryId).toBe('spot')
    expect(params.withdrawalOptions).toEqual({ mode: 'standard' })
  })

  it('takes a Balance as the source', () => {
    const balance: Balance = {
      categoryId: 'perps',
      asset: {
        providerId: 'lighter',
        id: '3',
        displaySymbol: 'USDC',
        logoURI: 'https://example.com/usdc.png',
      },
      units: '5',
      valueUsd: '5',
    }
    const source: WithdrawalAssetRef = balance

    expect(source.asset.id).toBe('3')
  })

  it('rejects assetId and route fields', () => {
    const params: WithdrawalParams = {
      destination: '0x1234567890123456789012345678901234567890',
      amount: '10',
      // @ts-expect-error — WithdrawalParams has no assetId
      assetId: '3',
    }

    expect(params.amount).toBe('10')
  })
})

describe('ActionResult', () => {
  it('accepts an acknowledged result with identifiers and no error', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Submitted,
      orderId: 'lighter-12345',
    }

    expect(result.orderId).toBe('lighter-12345')
    expect(result.error).toBeUndefined()
  })

  it('carries error and errorCode on a failed result', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Failed,
      error: 'order rejected',
      errorCode: PerpsErrorCode.ExchangeRejected,
    }

    expect(result.error).toBe('order rejected')
    expect(result.errorCode).toBe(PerpsErrorCode.ExchangeRejected)
  })

  it('carries error and errorCode on an indeterminate result', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Indeterminate,
      error: `request timed out. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`,
      errorCode: PerpsErrorCode.TimeoutError,
    }

    expect(result.error).toContain(CHECK_ACCOUNT_BEFORE_RETRY_TEXT)
    expect(result.errorCode).toBe(PerpsErrorCode.TimeoutError)
  })

  it('has no `refused` or `success` field', () => {
    const base = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Failed,
      error: 'order rejected',
    }
    // @ts-expect-error — `status` replaces `success`
    const withSuccess: ActionResult = { ...base, success: false }
    // @ts-expect-error — a failed result is always a refusal, so it has no `refused`
    const withRefused: ActionResult = { ...base, refused: true }
    expect(withSuccess.status).toBe(UserActionStatus.Failed)
    expect(withRefused.status).toBe(UserActionStatus.Failed)
  })

  it('keeps venue identifiers on every status', () => {
    const txHash = `0x${'8f2b1c4d'.repeat(8)}`
    const explorerLink = `https://app.lighter.xyz/explorer/logs/${txHash}`
    const results: ActionResult[] = [
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Accepted,
        orderId: '9',
        txHash,
        explorerLink,
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Indeterminate,
        error: 'no answer',
        orderId: '10',
        txHash,
      },
      {
        action: ActionType.PLACE_ORDER,
        status: UserActionStatus.Failed,
        error: 'order rejected',
        orderId: '11',
        txHash,
      },
    ]

    expect(results.map((r) => r.orderId)).toEqual(['9', '10', '11'])
    expect(results.every((r) => r.txHash === txHash)).toBe(true)
  })

  it('treats the identifiers as optional — a hashless venue result carries neither', () => {
    const result: ActionResult = {
      action: ActionType.PLACE_ORDER,
      status: UserActionStatus.Submitted,
      orderId: 'hl-1',
    }

    expect(result.txHash).toBeUndefined()
    expect(result.explorerLink).toBeUndefined()
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

describe('Hmac steps', () => {
  const placeOrder: HmacActionStep = {
    action: ActionType.PLACE_ORDER,
    request: {
      method: 'POST',
      path: '/v1/perps/orders',
      body: '{"symbol":"AAPL-USD.P","side":"buy","qty":"1"}',
    },
  }

  it('carries the venue-relative request description', () => {
    expect(placeOrder.action).toBe(ActionType.PLACE_ORDER)
    expect(placeOrder.request.method).toBe('POST')
    expect(placeOrder.request.path).toBe('/v1/perps/orders')
    expect(placeOrder.request.body).toBe(
      '{"symbol":"AAPL-USD.P","side":"buy","qty":"1"}'
    )
  })

  it('body is a pre-serialized string, optional (a DELETE cancel carries none)', () => {
    const cancelAll: HmacActionStep = {
      action: ActionType.CANCEL_ALL_ORDERS,
      request: { method: 'DELETE', path: '/v1/perps/orders' },
    }

    expect(cancelAll.request.body).toBeUndefined()
  })

  it('restricts method to the four HTTP verbs', () => {
    const bad: HmacActionStep = {
      action: ActionType.PLACE_ORDER,
      // @ts-expect-error method must be 'GET' | 'POST' | 'PUT' | 'DELETE'
      request: { method: 'PATCH', path: '/v1/perps/orders' },
    }

    expect(bad.request.path).toBe('/v1/perps/orders')
  })

  it('is a member of the ActionStep union', () => {
    const step: ActionStep = placeOrder

    expect(step.action).toBe(ActionType.PLACE_ORDER)
  })

  it('HmacSignedActionStep adds the structured HMAC material', () => {
    const signed: HmacSignedActionStep = {
      action: ActionType.PLACE_ORDER,
      request: placeOrder.request,
      hmac: {
        keyId: 'key-1',
        timestampMs: 1700000000000,
        signature: 'deadbeef',
      },
    }
    const step: SignedActionStep = signed

    expect(signed.hmac.signature).toBe('deadbeef')
    expect(step.action).toBe(ActionType.PLACE_ORDER)
  })

  it('requires the hmac field on the signed variant', () => {
    // @ts-expect-error hmac is required on HmacSignedActionStep
    const missingHmac: HmacSignedActionStep = {
      action: ActionType.PLACE_ORDER,
      request: placeOrder.request,
    }

    expect(missingHmac.action).toBe(ActionType.PLACE_ORDER)
  })
})

describe('Session steps', () => {
  const marker: SessionActionStep = {
    action: ActionType.ACCEPT_PROVIDER_TERMS,
    session: {},
  }

  it('carries no request material — the SDK authors the venue call itself', () => {
    const withRequest: SessionActionStep = {
      action: ActionType.ACCEPT_PROVIDER_TERMS,
      // @ts-expect-error — session is an empty marker, never a request payload
      session: { path: '/v1/agreement' },
    }

    expect(withRequest.action).toBe(ActionType.ACCEPT_PROVIDER_TERMS)
    expect(marker.session).toEqual({})
  })

  it('is a member of the ActionStep union', () => {
    const step: ActionStep = marker

    expect(step.action).toBe(ActionType.ACCEPT_PROVIDER_TERMS)
  })

  it('accepts the fixed CREATE_DEPOSIT_ADDRESS policy marker', () => {
    const depositMarker: SessionActionStep = {
      action: ActionType.CREATE_DEPOSIT_ADDRESS,
      session: {
        network: 'ethereum',
        symbol: 'USDC',
        depositDestination: { wallet: 'margin' },
      },
    }
    const step: ActionStep = depositMarker

    expect(step.action).toBe(ActionType.CREATE_DEPOSIT_ADDRESS)
    expect(depositMarker.session.depositDestination.wallet).toBe('margin')
  })

  it('is wired through ActionParamsMap on ACCEPT_PROVIDER_TERMS with empty params', () => {
    type Resolved = ActionParamsMap[ActionType.ACCEPT_PROVIDER_TERMS]
    const params: Resolved = {}

    expect(params).toEqual({})
  })
})

describe('Siwe steps', () => {
  const challenge: SiweActionStep = {
    action: ActionType.SIWE_LOGIN,
    siwe: {
      challengeId: 'chal-1',
      message:
        'api.ondoperps.xyz wants you to sign in with your Ethereum account:',
    },
  }

  it('carries the backend-built ERC-4361 challenge', () => {
    expect(challenge.action).toBe('siweLogin')
    expect(challenge.siwe.challengeId).toBe('chal-1')
    expect(challenge.siwe.message).toContain('sign in')
  })

  it('is a member of the ActionStep union', () => {
    const step: ActionStep = challenge

    expect(step.action).toBe(ActionType.SIWE_LOGIN)
  })

  it('SiweSignedActionStep adds the wallet signature', () => {
    const signed: SiweSignedActionStep = {
      action: ActionType.SIWE_LOGIN,
      siwe: challenge.siwe,
      signature: '0xsig',
    }
    const step: SignedActionStep = signed

    expect(signed.signature).toBe('0xsig')
    expect(step.action).toBe(ActionType.SIWE_LOGIN)
  })

  it('requires the signature on the signed variant', () => {
    // @ts-expect-error signature is required on SiweSignedActionStep
    const missingSignature: SiweSignedActionStep = {
      action: ActionType.SIWE_LOGIN,
      siwe: challenge.siwe,
    }

    expect(missingSignature.siwe.challengeId).toBe('chal-1')
  })
})
