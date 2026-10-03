import { PerpsError } from '@lifi/perps-sdk'
import Big from 'big.js'
import { describe, expect, it } from 'vitest'
import type { LtAccountAsset } from '../types/account.js'
import {
  pooledSettlementSpendable,
  pooledSettlementUnits,
  settlementSpotBalance,
} from './settlementPool.js'

const usdc = (
  balance: string,
  locked_balance: string,
  margin_balance: string
): LtAccountAsset => ({
  symbol: 'USDC',
  asset_id: 3,
  balance,
  locked_balance,
  margin_balance,
  multiplier: '1',
})

describe('pooledSettlementUnits', () => {
  it('adds the spot route to the perps route', () => {
    expect(
      pooledSettlementUnits(usdc('2.5', '1', '187.721957147883')).toFixed()
    ).toBe('190.221957147883')
  })

  it('rejects a non-decimal route', () => {
    expect(() => pooledSettlementUnits(usdc('n/a', '0', '1'))).toThrow(
      PerpsError
    )
  })
})

describe('pooledSettlementSpendable', () => {
  it('caps the perps route at available_balance', () => {
    expect(
      pooledSettlementSpendable(
        usdc('0', '0', '187.721957147883'),
        new Big('186.891946')
      ).toFixed()
    ).toBe('186.891946')
  })

  it('adds the free spot route to the whole perps route below available_balance', () => {
    expect(
      pooledSettlementSpendable(usdc('10', '4', '50'), new Big('80')).toFixed()
    ).toBe('56')
  })

  it('goes negative when the lock and a negative available_balance exceed the spot route', () => {
    expect(
      pooledSettlementSpendable(usdc('1', '3', '5'), new Big('-2')).toFixed()
    ).toBe('-4')
  })
})

describe('settlementSpotBalance', () => {
  it('reads the spot route of the settlement asset', () => {
    expect(
      settlementSpotBalance(
        [
          { ...usdc('9', '0', '0'), asset_id: 1 },
          usdc('60524.61222039', '0', '1'),
        ],
        3
      )
    ).toBe('60524.61222039')
  })

  it('returns 0 when the account holds no settlement asset', () => {
    expect(settlementSpotBalance([], 3)).toBe('0')
  })
})
