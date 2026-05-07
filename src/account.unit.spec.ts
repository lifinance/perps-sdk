import { describe, expect, it } from 'vitest'

import { ActivityType } from './enums.js'
import type {
  ActivityItem,
  DepositActivity,
  TransferActivity,
  WithdrawalActivity,
} from './account.js'

// ---------------------------------------------------------------------------
// Type-only assertions for ORD-220.
//
// These tests lock in the structural shape of the new `TransferActivity`
// variant, that the `ActivityItem` discriminated union narrows correctly off
// `type`, and that misshaped variants are rejected by the type system.
//
// Vitest still runs the file so the `.unit.spec.ts` glob picks it up and a
// regression that broke the discriminant or shape would fail `pnpm test:unit`
// via tsc rather than silently shipping a breaking type change.
// ---------------------------------------------------------------------------

describe('TransferActivity', () => {
  it('accepts a minimal IN-direction fixture', () => {
    const item: TransferActivity = {
      id: 'transfer-1',
      provider: 'lighter',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAccountIndex: 42,
      asset: 'USDC',
      amount: '100.50',
    }

    expect(item.type).toBe(ActivityType.TRANSFER)
    expect(item.direction).toBe('IN')
    expect(item.counterpartyAccountIndex).toBe(42)
    expect(item.asset).toBe('USDC')
    expect(item.amount).toBe('100.50')
    expect(item.meta).toBeUndefined()
  })

  it('accepts an OUT-direction fixture with provider-specific meta', () => {
    const item: TransferActivity = {
      id: 'transfer-2',
      provider: 'lighter',
      timestamp: '2026-05-07T12:01:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'OUT',
      counterpartyAccountIndex: 7,
      asset: 'USDC',
      amount: '25',
      meta: { txHash: '0xabc', memo: 'rebalance' },
    }

    expect(item.direction).toBe('OUT')
    expect(item.meta).toEqual({ txHash: '0xabc', memo: 'rebalance' })
  })

  it('participates in the ActivityItem discriminated union and narrows on type', () => {
    const item: ActivityItem = {
      id: 'transfer-3',
      provider: 'lighter',
      timestamp: '2026-05-07T12:02:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAccountIndex: 1,
      asset: 'USDC',
      amount: '1',
    }

    if (item.type === ActivityType.TRANSFER) {
      // Type narrowing: TS must allow access to TransferActivity-only fields.
      const direction: 'IN' | 'OUT' = item.direction
      const counterparty: number = item.counterpartyAccountIndex
      expect(direction).toBe('IN')
      expect(counterparty).toBe(1)
    } else {
      throw new Error('expected TRANSFER variant')
    }
  })

  it('narrows away from sibling variants', () => {
    const depositConcrete: DepositActivity = {
      id: 'deposit-1',
      provider: 'lighter',
      timestamp: '2026-05-07T12:03:00.000Z',
      type: ActivityType.DEPOSIT,
      amount: '500',
    }

    // Wrap in a function-parameter to widen back to the union — direct
    // assignments narrow to the RHS type and would defeat the test.
    const assertNotTransfer = (item: ActivityItem): void => {
      if (item.type !== ActivityType.TRANSFER) {
        expect(item.type).toBe(ActivityType.DEPOSIT)
        expect('direction' in item).toBe(false)
        expect('counterpartyAccountIndex' in item).toBe(false)
      } else {
        throw new Error('deposit should not narrow to TRANSFER')
      }
    }
    assertNotTransfer(depositConcrete)
  })

  it('rejects misshaped TRANSFER fixtures (compile-time check via @ts-expect-error)', () => {
    // Wrong direction literal — only 'IN' | 'OUT' are admissible.
    const badDirection: TransferActivity = {
      id: 't',
      provider: 'lighter',
      timestamp: '2026-05-07T12:04:00.000Z',
      type: ActivityType.TRANSFER,
      // @ts-expect-error direction must be 'IN' | 'OUT'
      direction: 'INBOUND',
      counterpartyAccountIndex: 1,
      asset: 'USDC',
      amount: '1',
    }

    // Missing required field counterpartyAccountIndex — TS2741 attaches to
    // the object literal opening brace, so place the directive there.
    // @ts-expect-error counterpartyAccountIndex is required
    const missingCounterparty: TransferActivity = {
      id: 't',
      provider: 'lighter',
      timestamp: '2026-05-07T12:05:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      asset: 'USDC',
      amount: '1',
    }

    // Wrong discriminant — cannot mark a non-TRANSFER variant with TRANSFER fields.
    const wrongType: TransferActivity = {
      id: 't',
      provider: 'lighter',
      timestamp: '2026-05-07T12:06:00.000Z',
      // @ts-expect-error type must be ActivityType.TRANSFER
      type: ActivityType.DEPOSIT,
      direction: 'IN',
      counterpartyAccountIndex: 1,
      asset: 'USDC',
      amount: '1',
    }

    // Wrong amount type — string per wire-format convention.
    const numericAmount: TransferActivity = {
      id: 't',
      provider: 'lighter',
      timestamp: '2026-05-07T12:07:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAccountIndex: 1,
      asset: 'USDC',
      // @ts-expect-error amount must be a string
      amount: 1,
    }

    expect(badDirection.type).toBe(ActivityType.TRANSFER)
    expect(missingCounterparty.type).toBe(ActivityType.TRANSFER)
    // Runtime value reflects the literal we wrote, even though TS now thinks
    // it's TRANSFER (the @ts-expect-error suppressed the discriminant error).
    expect(wrongType.type).toBe(ActivityType.DEPOSIT)
    expect(numericAmount.type).toBe(ActivityType.TRANSFER)
  })
})

describe('ActivityType.TRANSFER enum member', () => {
  it('has wire value "TRANSFER"', () => {
    expect(ActivityType.TRANSFER).toBe('TRANSFER')
  })

  it('is distinct from sibling members', () => {
    const all = new Set<string>([
      ActivityType.DEPOSIT,
      ActivityType.WITHDRAWAL,
      ActivityType.LIQUIDATION,
      ActivityType.FUNDING,
      ActivityType.TRANSFER,
    ])
    expect(all.size).toBe(5)
  })
})

describe('exhaustive narrowing across ActivityItem', () => {
  it('forces a TRANSFER branch in switch (type-level guard)', () => {
    const route = (item: ActivityItem): string => {
      switch (item.type) {
        case ActivityType.DEPOSIT:
          return `deposit:${item.amount}`
        case ActivityType.WITHDRAWAL:
          return `withdrawal:${item.amount}:${item.fee}`
        case ActivityType.LIQUIDATION:
          return `liquidation:${item.accountValue}`
        case ActivityType.FUNDING:
          return `funding:${item.fundingRate}`
        case ActivityType.TRANSFER:
          return `transfer:${item.direction}:${item.counterpartyAccountIndex}:${item.amount}`
        default: {
          // If a new variant is added, this assignment fails — locking
          // exhaustiveness for future ActivityType extensions.
          const _exhaustive: never = item
          return _exhaustive
        }
      }
    }

    const transfer: TransferActivity = {
      id: 'transfer-4',
      provider: 'lighter',
      timestamp: '2026-05-07T12:08:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'OUT',
      counterpartyAccountIndex: 99,
      asset: 'USDC',
      amount: '12.34',
    }
    expect(route(transfer)).toBe('transfer:OUT:99:12.34')

    const withdrawal: WithdrawalActivity = {
      id: 'w-1',
      provider: 'lighter',
      timestamp: '2026-05-07T12:09:00.000Z',
      type: ActivityType.WITHDRAWAL,
      amount: '50',
      fee: '0.1',
    }
    expect(route(withdrawal)).toBe('withdrawal:50:0.1')
  })
})
