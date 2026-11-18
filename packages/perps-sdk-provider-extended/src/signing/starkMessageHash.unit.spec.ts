import type { Hex } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  type HashCallFixture,
  registrationCases,
  starkCases,
  starkFixtures,
} from '../../test/fixtures/starkFixtures.js'
import {
  calculateStarkOrderHash,
  calculateStarkRegistrationHash,
  calculateStarkTransferHash,
  calculateStarkWithdrawalHash,
  EXTENDED_MAINNET_STARK_DOMAIN,
  type StarkDomain,
} from './starkMessageHash.js'

const toPublicKey = (decimal: string): Hex =>
  `0x${BigInt(decimal).toString(16)}`

function calculateFixtureHash({ fn, inputs }: HashCallFixture): Hex {
  const domain: StarkDomain = {
    name: inputs.domain_name,
    version: inputs.domain_version,
    chainId: inputs.domain_chain_id,
    revision: inputs.domain_revision,
  }
  const publicKey = toPublicKey(inputs.user_public_key)
  switch (fn) {
    case 'get_order_msg_hash':
      return calculateStarkOrderHash(
        {
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
        domain,
        publicKey
      )
    case 'get_transfer_msg_hash':
      return calculateStarkTransferHash(
        {
          recipientPositionId: inputs.recipient_position_id,
          senderPositionId: inputs.sender_position_id,
          collateralId: inputs.collateral_id,
          amount: inputs.amount,
          expiration: inputs.expiration,
          salt: inputs.salt,
        },
        domain,
        publicKey
      )
    case 'get_withdrawal_msg_hash':
      return calculateStarkWithdrawalHash(
        {
          recipient: inputs.recipient_hex,
          positionId: inputs.position_id,
          collateralId: inputs.collateral_id,
          amount: inputs.amount,
          expiration: inputs.expiration,
          salt: inputs.salt,
        },
        domain,
        publicKey
      )
  }
}

describe('Stark message hashes', () => {
  it.each(starkCases)('match the Python SDK: $label', ({ hashCalls }) => {
    for (const hashCall of hashCalls) {
      expect(calculateFixtureHash(hashCall)).toBe(hashCall.hash)
    }
  })

  it('use the mainnet domain of the fixtures', () => {
    const domains = new Set(
      starkCases.flatMap(({ hashCalls }) =>
        hashCalls.map(({ inputs }) =>
          JSON.stringify([
            inputs.domain_name,
            inputs.domain_version,
            inputs.domain_chain_id,
            inputs.domain_revision,
          ])
        )
      )
    )
    const { name, version, chainId, revision } = EXTENDED_MAINNET_STARK_DOMAIN
    expect([...domains]).toEqual([
      JSON.stringify([name, version, chainId, revision]),
    ])
  })

  it.each(registrationCases)('match the registration hash of the Python SDK', ({
    starkMessage,
    payload,
  }) => {
    expect(
      calculateStarkRegistrationHash(
        starkFixtures.meta.ethAddress,
        payload.l2Key
      )
    ).toBe(starkMessage)
  })
})
