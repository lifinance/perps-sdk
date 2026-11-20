import { readFileSync } from 'node:fs'
import type { Hex } from '@lifi/perps-types'

interface StarkSignatureFixture {
  r: Hex
  s: Hex
}

export interface HashCallFixture {
  fn: 'get_order_msg_hash' | 'get_transfer_msg_hash' | 'get_withdrawal_msg_hash'
  inputs: Record<string, string>
  hash: Hex
}

interface SignedRequestFixture {
  settlement?: { signature: StarkSignatureFixture }
  takeProfit?: { settlement: { signature: StarkSignatureFixture } }
  stopLoss?: { settlement: { signature: StarkSignatureFixture } }
}

export interface StarkCaseFixture {
  label: string
  hashCalls: HashCallFixture[]
  signatures: StarkSignatureFixture[]
}

interface ExtendedStarkFixtures {
  meta: { ethAddress: Hex }
  keyDerivation: {
    network: string
    accountIndex: string
    walletSignature: string
    starkPrivateKey: Hex
    starkPublicKey: Hex
  }[]
  keyFromSignature: { label: string; signature: Hex; starkPrivateKey: Hex }[]
  onboarding: (
    | {
        kind: 'onboard'
        starkMessage: Hex
        payload: { l2Key: Hex; l2Signature: StarkSignatureFixture }
      }
    | { kind: 'subaccount' }
  )[]
  orders: {
    name: string
    request: SignedRequestFixture
    hashCalls: HashCallFixture[]
  }[]
  withdrawals: {
    amount: string
    request: SignedRequestFixture
    hashCalls: HashCallFixture[]
  }[]
  transfers: {
    amount: string
    request: SignedRequestFixture
    hashCalls: HashCallFixture[]
  }[]
}

/**
 * Hashes, keys, and signatures from Extended's Python SDK. See
 * `generate_fixtures.py` next to the JSON file.
 */
export const starkFixtures: ExtendedStarkFixtures = JSON.parse(
  readFileSync(
    new URL('./extended-stark-fixtures.json', import.meta.url),
    'utf8'
  )
)

const signaturesOf = (request: SignedRequestFixture): StarkSignatureFixture[] =>
  [
    request.settlement?.signature,
    request.takeProfit?.settlement.signature,
    request.stopLoss?.settlement.signature,
  ].filter((signature) => signature !== undefined)

export const starkCases: StarkCaseFixture[] = [
  ...starkFixtures.orders.map((order) => ({
    label: order.name,
    hashCalls: order.hashCalls,
    signatures: signaturesOf(order.request),
  })),
  ...starkFixtures.withdrawals.map((withdrawal) => ({
    label: `withdrawal ${withdrawal.amount}`,
    hashCalls: withdrawal.hashCalls,
    signatures: signaturesOf(withdrawal.request),
  })),
  ...starkFixtures.transfers.map((transfer) => ({
    label: `transfer ${transfer.amount}`,
    hashCalls: transfer.hashCalls,
    signatures: signaturesOf(transfer.request),
  })),
]

/** Account registrations: the Stark key signs the wallet and its public key. */
export const registrationCases = starkFixtures.onboarding.flatMap((entry) =>
  entry.kind === 'onboard' ? [entry] : []
)

const mainnetKey = starkFixtures.keyDerivation.find(
  (key) => key.network === 'mainnet' && key.accountIndex === '0'
)
if (mainnetKey === undefined) {
  throw new Error('The fixtures have no mainnet key for account index 0.')
}

/** The key that signs every order, withdrawal, and transfer fixture. */
export const signingKey = mainnetKey
