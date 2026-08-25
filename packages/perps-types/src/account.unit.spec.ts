import { describe, expect, it } from 'vitest'
import type {
  AccountConfig,
  ActivityItem,
  DepositActivity,
  LiquidationActivity,
  MarketSettings,
  OndoAccountConfig,
  TransferActivity,
  WithdrawalActivity,
} from './account.js'
import { ActivityType, MarginMode } from './enums.js'
import type { MarketDisplay } from './market.js'

// Type-level coverage for `TransferActivity`: the structural shape, narrowing
// off the `type` discriminator, and rejection of misshaped variants. Vitest
// runs the file via the `.unit.spec.ts` glob so a regression also fails
// `pnpm test:unit` via tsc.
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

  it('accepts a counterpartyAddress-only fixture (HL spotTransfer shape)', () => {
    const item: TransferActivity = {
      id: 'transfer-hl-1',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:01:30.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAddress: '0xabcdef0123456789abcdef0123456789abcdef01',
      asset: 'USDC',
      amount: '5',
      meta: { transferType: 'spotTransfer' },
    }

    expect(item.counterpartyAddress).toBe(
      '0xabcdef0123456789abcdef0123456789abcdef01'
    )
    expect(item.counterpartyAccountIndex).toBeUndefined()
  })

  it('accepts a fixture with BOTH counterparty fields populated', () => {
    const item: TransferActivity = {
      id: 'transfer-both-1',
      provider: 'hybrid',
      timestamp: '2026-05-07T12:01:45.000Z',
      type: ActivityType.TRANSFER,
      direction: 'OUT',
      counterpartyAccountIndex: 99,
      counterpartyAddress: '0xffff000000000000000000000000000000000001',
      asset: 'USDC',
      amount: '10',
    }

    expect(item.counterpartyAccountIndex).toBe(99)
    expect(item.counterpartyAddress).toBe(
      '0xffff000000000000000000000000000000000001'
    )
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
      asset: 'USDC',
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

    // Missing BOTH counterparty fields — `TransferActivity` is a union that
    // requires at least one of `counterpartyAccountIndex` / `counterpartyAddress`.
    // TS2322 attaches to the object literal opening brace, so place the
    // directive there.
    // @ts-expect-error at least one of counterpartyAccountIndex / counterpartyAddress is required
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

describe('explorerLink on on-chain item types', () => {
  it('accepts a resolved explorerLink on deposit / withdrawal / transfer', () => {
    const deposit: DepositActivity = {
      id: 'd',
      provider: 'lighter',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.DEPOSIT,
      asset: 'USDC',
      amount: '1',
      explorerLink: 'https://etherscan.io/tx/0xabc',
    }
    const withdrawal: WithdrawalActivity = {
      id: 'w',
      provider: 'lighter',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.WITHDRAWAL,
      asset: 'USDC',
      amount: '1',
      fee: '0',
      explorerLink: 'https://etherscan.io/tx/0xdef',
    }
    const transfer: TransferActivity = {
      id: 't',
      provider: 'lighter',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.TRANSFER,
      direction: 'IN',
      counterpartyAccountIndex: 1,
      asset: 'USDC',
      amount: '1',
      explorerLink: 'https://app.lighter.xyz/explorer/logs/0000abcd',
    }

    expect(deposit.explorerLink).toBe('https://etherscan.io/tx/0xabc')
    expect(withdrawal.explorerLink).toBe('https://etherscan.io/tx/0xdef')
    expect(transfer.explorerLink).toBe(
      'https://app.lighter.xyz/explorer/logs/0000abcd'
    )
  })

  it('treats explorerLink as optional (absent ⇒ no on-chain tx)', () => {
    const deposit: DepositActivity = {
      id: 'd',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.DEPOSIT,
      asset: 'USDC',
      amount: '1',
    }
    expect(deposit.explorerLink).toBeUndefined()
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

describe('OndoAccountConfig', () => {
  it('accepts a logged-in fixture with authTokenExpiry', () => {
    const config: OndoAccountConfig = {
      provider: 'ondo',
      loggedIn: true,
      authTokenExpiry: 1_780_000_000,
      termsAccepted: true,
      apiKeyRegistered: true,
      referralSet: true,
      depositAddress: null,
    }

    expect(config.loggedIn).toBe(true)
    expect(config.authTokenExpiry).toBe(1_780_000_000)
    expect(config.termsAccepted).toBe(true)
    expect(config.apiKeyRegistered).toBe(true)
    expect(config.referralSet).toBe(true)
  })

  it('accepts a logged-out fixture without authTokenExpiry', () => {
    const config: OndoAccountConfig = {
      provider: 'ondo',
      loggedIn: false,
      termsAccepted: false,
      apiKeyRegistered: true,
      referralSet: false,
      depositAddress: null,
    }

    expect(config.loggedIn).toBe(false)
    expect(config.authTokenExpiry).toBeUndefined()
    expect(config.apiKeyRegistered).toBe(true)
  })

  it('requires termsAccepted and apiKeyRegistered on every fixture', () => {
    // @ts-expect-error termsAccepted and apiKeyRegistered are required
    const missing: OndoAccountConfig = {
      provider: 'ondo',
      loggedIn: false,
      referralSet: false,
      depositAddress: null,
    }

    expect(missing.provider).toBe('ondo')
  })

  it('participates in the AccountConfig union and narrows on provider', () => {
    const config: AccountConfig = {
      provider: 'ondo',
      loggedIn: true,
      authTokenExpiry: 1_780_000_000,
      termsAccepted: true,
      apiKeyRegistered: false,
      referralSet: false,
      depositAddress: null,
    }

    if (config.provider === 'ondo') {
      const loggedIn: boolean = config.loggedIn
      expect(loggedIn).toBe(true)
    } else {
      throw new Error('expected ondo variant')
    }
  })

  it('rejects credential material on the config object', () => {
    const withToken: OndoAccountConfig = {
      provider: 'ondo',
      loggedIn: true,
      termsAccepted: true,
      apiKeyRegistered: false,
      referralSet: false,
      depositAddress: null,
      // @ts-expect-error the JWT itself never appears in AccountConfig
      authToken: 'eyJhbGciOiJIUzI1NiJ9',
    }

    expect(withToken.provider).toBe('ondo')
  })
})

const liquidatedMarket = (providerId: string): MarketDisplay => ({
  providerId,
  id: 'ETH',
  categoryId: 'perps',
  baseAsset: { providerId, id: 'ETH', displaySymbol: 'ETH', logoURI: '' },
  quoteAsset: { providerId, id: 'USDC', displaySymbol: 'USDC', logoURI: '' },
})

describe('LiquidationActivity', () => {
  it('accepts a fixture that omits leverageType', () => {
    const item: LiquidationActivity = {
      id: 'liquidation-1',
      provider: 'lighter',
      timestamp: '2026-05-07T12:00:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedPositions: [{ market: liquidatedMarket('lighter') }],
    }

    expect(item.leverageType).toBeUndefined()
  })

  it('accepts a fixture that carries a venue margin mode', () => {
    const item: LiquidationActivity = {
      id: 'liquidation-2',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:01:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedNotionalPosition: '1000',
      accountValue: '500',
      leverageType: 'cross',
      liquidatedPositions: [
        { market: liquidatedMarket('hyperliquid'), size: '-1.5' },
      ],
    }

    expect(item.leverageType).toBe('cross')
  })

  it('rejects misshaped liquidation fixtures', () => {
    const numericLeverageType: LiquidationActivity = {
      id: 'liquidation-3',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:02:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedNotionalPosition: '1000',
      accountValue: '500',
      // @ts-expect-error leverageType must be a string
      leverageType: 1,
      liquidatedPositions: [{ market: liquidatedMarket('hyperliquid') }],
    }

    // TS2741 attaches to the object literal opening brace.
    // @ts-expect-error liquidatedPositions is required
    const missingPositions: LiquidationActivity = {
      id: 'liquidation-4',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:03:00.000Z',
      type: ActivityType.LIQUIDATION,
      liquidatedNotionalPosition: '1000',
      accountValue: '500',
    }

    expect(numericLeverageType.type).toBe(ActivityType.LIQUIDATION)
    expect(missingPositions.type).toBe(ActivityType.LIQUIDATION)
  })

  it('rejects an empty liquidatedPositions array', () => {
    const emptyPositions: LiquidationActivity = {
      id: 'liquidation-5',
      provider: 'hyperliquid',
      timestamp: '2026-05-07T12:04:00.000Z',
      type: ActivityType.LIQUIDATION,
      // @ts-expect-error liquidatedPositions must hold at least one entry
      liquidatedPositions: [],
    }

    expect(emptyPositions.type).toBe(ActivityType.LIQUIDATION)
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
      asset: 'USDC',
      amount: '50',
      fee: '0.1',
    }
    expect(route(withdrawal)).toBe('withdrawal:50:0.1')
  })
})

describe('MarketSettings', () => {
  it('requires margin mode and leverage as a complete pair', () => {
    const complete: MarketSettings = {
      marginMode: MarginMode.ISOLATED,
      leverage: 2.5,
    }

    // @ts-expect-error a mode without leverage is not a complete setting
    const missingLeverage: MarketSettings = {
      marginMode: MarginMode.CROSS,
    }
    // @ts-expect-error leverage without a mode is not a complete setting
    const missingMode: MarketSettings = { leverage: 3 }

    expect(complete).toEqual({
      marginMode: MarginMode.ISOLATED,
      leverage: 2.5,
    })
    expect(missingLeverage.marginMode).toBe(MarginMode.CROSS)
    expect(missingMode.leverage).toBe(3)
  })
})
