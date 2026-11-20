import { readFileSync } from 'node:fs'
import type { Hex, StarkMessage } from '@lifi/perps-types'
import type { StarkDomain } from '../../src/signing/starkMessageHash.js'

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
  meta: { ethAddress: Hex; ethPrivateKey: string; frozenNow: string }
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
        payload: {
          l1Signature: string
          l2Key: Hex
          l2Signature: StarkSignatureFixture
          accountCreation: Record<string, unknown>
          referralCode: string | null
        }
      }
    | { kind: 'subaccount' }
  )[]
  apiRequestSignature: { path: string; time: string; signature: string }[]
  orders: {
    name: string
    request: SignedRequestFixture & Record<string, unknown>
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

type WithoutPath<M> = M extends unknown ? Omit<M, 'signaturePath'> : never
type FixtureMessage = WithoutPath<StarkMessage>

/** The Stark message and the hash inputs that a Python SDK hash call used. */
export function toStarkMessage({ fn, inputs }: HashCallFixture): {
  message: FixtureMessage
  domain: StarkDomain
  publicKey: Hex
} {
  const domain: StarkDomain = {
    name: inputs.domain_name,
    version: inputs.domain_version,
    chainId: inputs.domain_chain_id,
    revision: inputs.domain_revision,
  }
  const publicKey: Hex = `0x${BigInt(inputs.user_public_key).toString(16)}`
  switch (fn) {
    case 'get_order_msg_hash':
      return {
        domain,
        publicKey,
        message: {
          type: 'order',
          fields: {
            positionId: inputs.position_id,
            baseAssetId: inputs.base_asset_id,
            baseAmount: inputs.base_amount,
            quoteAssetId: inputs.quote_asset_id,
            quoteAmount: inputs.quote_amount,
            feeAssetId: inputs.fee_asset_id,
            feeAmount: inputs.fee_amount,
            expiration: inputs.expiration,
            salt: inputs.salt,
          },
        },
      }
    case 'get_transfer_msg_hash':
      return {
        domain,
        publicKey,
        message: {
          type: 'transfer',
          fields: {
            recipientPositionId: inputs.recipient_position_id,
            senderPositionId: inputs.sender_position_id,
            collateralId: inputs.collateral_id,
            amount: inputs.amount,
            expiration: inputs.expiration,
            salt: inputs.salt,
          },
        },
      }
    case 'get_withdrawal_msg_hash':
      return {
        domain,
        publicKey,
        message: {
          type: 'withdrawal',
          fields: {
            recipient: inputs.recipient_hex,
            positionId: inputs.position_id,
            collateralId: inputs.collateral_id,
            amount: inputs.amount,
            expiration: inputs.expiration,
            salt: inputs.salt,
          },
        },
      }
  }
}
