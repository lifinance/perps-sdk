import type { PortfolioHistoryPoint } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type { HlLedgerDelta, HlLedgerUpdate } from '../types/index.js'
import { mapPortfolioTransfers } from './mapPortfolioTransfers.js'

// Shapes: https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/usernonfundingledgerupdates
const USER = '0x1234567890123456789012345678901234567890'
const OTHER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const points: PortfolioHistoryPoint[] = [10, 20, 30, 30, 40].map(
  (timestamp) => ({
    timestamp,
    accountValue: '9007199254740993.01',
    pnl: '1.234',
  })
)
const row = (
  time: number,
  delta: HlLedgerDelta,
  hash = `${time}`
): HlLedgerUpdate => ({ time, hash, delta })
const send = (overrides: Record<string, unknown> = {}): HlLedgerDelta => ({
  type: 'send',
  user: USER,
  destination: OTHER,
  sourceDex: '',
  destinationDex: '',
  token: 'USDC',
  amount: '12.34',
  usdcValue: '12.34',
  fee: '1',
  nativeTokenFee: '0',
  nonce: 1,
  feeToken: 'USDC',
  ...overrides,
})

const flows = (ledger: HlLedgerUpdate[], combined = false) =>
  mapPortfolioTransfers(points, ledger, USER, combined).map(
    (point) => point.netTransfers
  )

describe('mapPortfolioTransfers', () => {
  it('anchors the first sample, includes right boundaries, and counts duplicate rows once', () => {
    const deposit = row(20, { type: 'deposit', usdc: '0.2' })
    const result = mapPortfolioTransfers(
      points,
      [
        row(9, { type: 'deposit', usdc: '100' }),
        row(10, { type: 'deposit', usdc: '100' }),
        deposit,
        deposit,
        row(20, { type: 'withdraw', usdc: '0.1', fee: '1' }, 'other'),
        row(31, { type: 'deposit', usdc: '9007199254740993.01' }),
        row(41, { type: 'deposit', usdc: '100' }),
      ],
      USER,
      false
    )
    expect(result.map((p) => p.netTransfers)).toEqual([
      '0',
      '0.1',
      '0.1',
      '0.1',
      '9007199254740993.11',
    ])
    expect(result.map(({ netTransfers: _, ...point }) => point)).toEqual(points)
    expect(points.every((p) => !('netTransfers' in p))).toBe(true)
  })

  it.each<[HlLedgerDelta, boolean, string | undefined]>([
    [{ type: 'deposit', usdc: '2.1' }, false, '2.1'],
    [{ type: 'withdraw', usdc: '2.1', fee: '1' }, true, '-2.1'],
    [
      {
        type: 'borrowLend',
        token: 'HYPE',
        amount: '10',
        operation: 'withdraw',
        interestAmount: '0.0',
        usdcValue: '100',
      },
      true,
      '100',
    ],
    [
      {
        type: 'borrowLend',
        token: 'HYPE',
        amount: '10',
        operation: 'repay',
        interestAmount: '0',
        usdcValue: '100',
      },
      true,
      '-100',
    ],
    [{ type: 'accountClassTransfer', usdc: '5', toPerp: true }, false, '5'],
    [{ type: 'accountClassTransfer', usdc: '5', toPerp: false }, false, '-5'],
    [{ type: 'accountClassTransfer', usdc: 'bad', toPerp: true }, true, '0'],
    [{ type: 'accountClassTransfer', usdc: '5' }, false, undefined],
    [
      {
        type: 'internalTransfer',
        user: OTHER,
        destination: USER,
        usdc: '4',
        fee: '1',
      },
      false,
      '4',
    ],
    [
      { type: 'subAccountTransfer', user: USER, destination: OTHER, usdc: '4' },
      true,
      '-4',
    ],
    [
      { type: 'internalTransfer', user: USER, destination: USER, usdc: 'bad' },
      false,
      '0',
    ],
    [send({ user: undefined }), true, undefined],
    [send({ user: 'invalid' }), true, undefined],
    [send({ destination: undefined }), true, undefined],
    [send({ destination: 'invalid' }), true, undefined],
    [send({ destinationDex: undefined }), true, undefined],
    [send({ token: undefined }), true, undefined],
    [send({ token: 'HYPE', usdcValue: 'NaN' }), true, undefined],
    [{ type: 'vaultCreate', vault: OTHER, usdc: '7', fee: '1' }, true, '-7'],
    [{ type: 'vaultDeposit', usdc: '7' }, true, undefined],
    [{ type: 'vaultWithdraw', vault: OTHER }, true, undefined],
    [{ type: 'vaultWithdraw', user: USER }, true, undefined],
    [{ type: 'vaultWithdraw', vault: USER, user: USER }, true, '0'],
    [{ type: 'vaultWithdraw', vault: OTHER, user: OTHER }, true, undefined],
    [{ type: 'cStakingTransfer', token: 'HYPE', amount: '2' }, true, undefined],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'withdraw',
        interestAmount: 'bad',
      },
      true,
      undefined,
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: 'bad',
        operation: 'withdraw',
        interestAmount: '0',
      },
      true,
      undefined,
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '1',
        operation: 'repay',
        interestAmount: '2',
      },
      true,
      undefined,
    ],
    [{ type: 'spotGenesis', token: 'HYPE', amount: '12' }, true, '0'],
    [send(), false, '-12.34'],
    [send({ user: OTHER, destination: USER }), false, '12.34'],
    [send({ user: OTHER, destination: OTHER }), false, '0'],
    [send({ destination: USER, sourceDex: 'spot' }), false, '12.34'],
    [send({ destination: USER, destinationDex: 'spot' }), false, '-12.34'],
    [send({ destination: USER, sourceDex: 'spot' }), true, '0'],
    [
      send({ destination: USER, sourceDex: 'xyz', destinationDex: 'abc' }),
      false,
      '0',
    ],
    [
      send({ user: OTHER, destination: USER, destinationDex: 'spot' }),
      false,
      '0',
    ],
    [send({ sourceDex: 'spot' }), false, '0'],
    [send({ sourceDex: 'spot' }), true, '-12.34'],
    [send({ sourceDex: undefined }), false, undefined],
    [send({ token: 'HYPE', amount: '2', usdcValue: '60' }), true, '-60'],
    [send({ token: 'HYPE', usdcValue: undefined }), true, undefined],
    [send({ amount: 'NaN' }), false, undefined],
    [send({ amount: '-1' }), false, undefined],
    [
      {
        type: 'spotTransfer',
        user: OTHER,
        destination: USER,
        token: 'HYPE',
        amount: '2',
        usdcValue: '60',
      },
      true,
      '60',
    ],
    [
      {
        type: 'spotTransfer',
        user: OTHER,
        destination: USER,
        token: 'HYPE',
        amount: '2',
        usdcValue: '60',
      },
      false,
      '0',
    ],
    [{ type: 'vaultDeposit', vault: OTHER, usdc: '7' }, false, '-7'],
    [{ type: 'vaultDeposit', vault: USER, usdc: '7' }, true, undefined],
    [
      {
        type: 'vaultWithdraw',
        vault: OTHER,
        user: USER,
        requestedUsd: '10',
        commission: '1',
        closingCost: '2',
        basis: '5',
        netWithdrawnUsd: '7',
      },
      true,
      '7',
    ],
    [
      {
        type: 'vaultWithdraw',
        vault: USER,
        user: OTHER,
        requestedUsd: '10',
        commission: '1',
        closingCost: '2',
        basis: '5',
        netWithdrawnUsd: '7',
      },
      false,
      '-10',
    ],
    [
      { type: 'cStakingTransfer', token: 'HYPE', amount: '2', isDeposit: true },
      true,
      undefined,
    ],
    [
      { type: 'cStakingTransfer', token: 'HYPE', amount: '2', isDeposit: true },
      false,
      '0',
    ],
    [
      {
        type: 'cStakingTransfer',
        token: 'HYPE',
        amount: '2',
        isDeposit: false,
        usdcValue: '60',
      },
      true,
      '60',
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'supply',
        interestAmount: '0',
      },
      true,
      '-10',
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'withdraw',
        interestAmount: '1',
      },
      true,
      '9',
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'borrow',
        interestAmount: '0',
      },
      true,
      '10',
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'repay',
        interestAmount: '1',
      },
      true,
      '-9',
    ],
    [
      {
        type: 'borrowLend',
        token: 'HYPE',
        amount: '10',
        operation: 'supply',
        interestAmount: '0',
      },
      false,
      '0',
    ],
    [
      {
        type: 'borrowLend',
        token: 'HYPE',
        amount: '10',
        operation: 'withdraw',
        interestAmount: '1',
        usdcValue: '100',
      },
      true,
      undefined,
    ],
    [
      {
        type: 'borrowLend',
        token: 'USDC',
        amount: '10',
        operation: 'unknown',
        interestAmount: '0',
      },
      true,
      undefined,
    ],
    [{ type: 'liquidation' }, true, '0'],
    [{ type: 'funding', usdc: '12' }, false, '0'],
    [{ type: 'rewardsClaim', token: 'USDC', amount: '12' }, true, '0'],
    [{ type: 'vaultLeaderCommission', user: USER, usdc: '12' }, true, '0'],
    [{ type: 'deployGasAuction', token: 'USDC', amount: '12' }, true, '0'],
    [{ type: 'futureMovement', usdc: '12' }, true, undefined],
    [{ type: 'deposit', usdc: '' }, false, undefined],
  ])('classifies %j for combined=%s as %s', (delta, combined, expected) => {
    expect(flows([row(20, delta)], combined)).toEqual([
      '0',
      expected,
      expected,
      expected,
      expected,
    ])
  })

  it('never restores coverage after an unquantified movement', () => {
    expect(
      flows([
        row(20, { type: 'deposit', usdc: '2' }),
        row(30, { type: 'unknown' }),
        row(31, { type: 'withdraw', usdc: '2' }),
      ])
    ).toEqual(['0', '2', undefined, undefined, undefined])
  })

  it('returns zero for a complete interval with no capital movements', () => {
    expect(flows([])).toEqual(['0', '0', '0', '0', '0'])
    expect(mapPortfolioTransfers([], [], USER, true)).toEqual([])
  })
})
