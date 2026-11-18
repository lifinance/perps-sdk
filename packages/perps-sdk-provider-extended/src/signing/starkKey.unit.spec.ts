import { describe, expect, it } from 'vitest'
import {
  registrationCases,
  signingKey,
  starkCases,
  starkFixtures,
} from '../../test/fixtures/starkFixtures.js'
import {
  calculateStarkPrivateKey,
  calculateStarkPublicKey,
  signStarkHash,
} from './starkKey.js'

describe('calculateStarkPrivateKey', () => {
  it.each(starkFixtures.keyFromSignature)('matches Extended for r: $label', ({
    signature,
    starkPrivateKey,
  }) => {
    expect(calculateStarkPrivateKey(signature)).toBe(starkPrivateKey)
  })

  it.each(
    starkFixtures.keyDerivation
  )('matches the Python SDK for $network account $accountIndex', ({
    walletSignature,
    starkPrivateKey,
    starkPublicKey,
  }) => {
    const privateKey = calculateStarkPrivateKey(walletSignature)
    expect(privateKey).toBe(starkPrivateKey)
    expect(calculateStarkPublicKey(privateKey)).toBe(starkPublicKey)
  })
})

describe('signStarkHash', () => {
  it.each(
    starkCases.filter(({ signatures }) => signatures.length > 0)
  )('matches the Python SDK signatures: $label', ({
    hashCalls,
    signatures,
  }) => {
    const signed = hashCalls.map(({ hash }) =>
      signStarkHash(hash, signingKey.starkPrivateKey)
    )
    for (const signature of signatures) {
      expect(signed).toContainEqual(signature)
    }
  })

  it.each(
    registrationCases
  )('matches the registration signature of the Python SDK', ({
    starkMessage,
    payload,
  }) => {
    expect(signStarkHash(starkMessage, signingKey.starkPrivateKey)).toEqual(
      payload.l2Signature
    )
  })
})
