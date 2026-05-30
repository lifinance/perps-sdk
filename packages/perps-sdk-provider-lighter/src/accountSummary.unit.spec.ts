import type {
  AccountResponse,
  LighterAccountConfig,
  Position,
} from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { summarizeLighterAccount } from './accountSummary.js'

const ADDRESS = '0x2222222222222222222222222222222222222222'

const LIGHTER_CONFIG: LighterAccountConfig = {
  provider: 'lighter',
  accountIndex: 0,
  apiKeyIndex: 0,
  apiKeyRegistered: true,
  accountType: 0,
  readOnlyTokenApproved: false,
}

function account(balances: AccountResponse['balances']): AccountResponse {
  return {
    provider: 'lighter',
    address: ADDRESS,
    balances,
    marginUsed: '0',
    unrealizedPnl: '0',
    feeTier: { maker: '0', taker: '0' },
    config: LIGHTER_CONFIG,
  }
}

const NO_POSITIONS: Position[] = []

describe('summarizeLighterAccount collateralGrouping', () => {
  it('defaults to perMarket (Lighter has no unified abstraction)', () => {
    const summary = summarizeLighterAccount(
      account({ lighter: [{ currency: 'USDC', amount: '500' }] }),
      NO_POSITIONS,
      {}
    )
    expect(summary.collateralGrouping).toBe('perMarket')
  })
})
