import type { Hex } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import {
  type HashCallFixture,
  registrationCases,
  starkCases,
  starkFixtures,
  toStarkMessage,
} from '../../test/fixtures/starkFixtures.js'
import {
  calculateStarkOrderHash,
  calculateStarkRegistrationHash,
  calculateStarkTransferHash,
  calculateStarkWithdrawalHash,
  EXTENDED_MAINNET_STARK_DOMAIN,
} from './starkMessageHash.js'

function calculateFixtureHash(hashCall: HashCallFixture): Hex {
  const { message, domain, publicKey } = toStarkMessage(hashCall)
  switch (message.type) {
    case 'order':
      return calculateStarkOrderHash(message.fields, domain, publicKey)
    case 'transfer':
      return calculateStarkTransferHash(message.fields, domain, publicKey)
    case 'withdrawal':
      return calculateStarkWithdrawalHash(message.fields, domain, publicKey)
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
