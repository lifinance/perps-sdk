import { describe, expect, it } from 'vitest'
import {
  isAccountActivationGasDelta,
  isGossipPriorityGasAuctionDelta,
  isRewardsClaimDelta,
} from './ledger.js'

describe.each([
  {
    guard: isGossipPriorityGasAuctionDelta,
    delta: {
      type: 'gossipPriorityGasAuction',
      token: 'HYPE',
      amount: '0.30773712',
    },
  },
  {
    guard: isAccountActivationGasDelta,
    delta: {
      type: 'accountActivationGas',
      amount: '0.02283782',
      token: 'HYPE',
    },
  },
  {
    guard: isRewardsClaimDelta,
    delta: { type: 'rewardsClaim', amount: '18.40514403', token: 'USDC' },
  },
])('$guard.name', ({ guard, delta }) => {
  it('accepts a delta with a string token and amount', () => {
    expect(guard(delta)).toBe(true)
  })

  it('rejects another delta type', () => {
    expect(guard({ ...delta, type: 'spotGenesis' })).toBe(false)
  })

  it.each([
    ['no amount', { type: delta.type, token: delta.token }],
    ['a numeric amount', { ...delta, amount: 0.5 }],
    ['a null amount', { ...delta, amount: null }],
    ['no token', { type: delta.type, amount: delta.amount }],
    ['a numeric token', { ...delta, token: 150 }],
  ])('rejects a delta with %s', (_, malformed) => {
    expect(guard(malformed)).toBe(false)
  })
})
