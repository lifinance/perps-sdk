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
  it.each(
    starkFixtures.keyFromSignature
  )('matches Extended for r: $label', async ({
    signature,
    starkPrivateKey,
  }) => {
    expect(await calculateStarkPrivateKey(signature)).toBe(starkPrivateKey)
  })

  it.each(
    starkFixtures.keyDerivation
  )('matches the Python SDK for $network account $accountIndex', async ({
    walletSignature,
    starkPrivateKey,
    starkPublicKey,
  }) => {
    const privateKey = await calculateStarkPrivateKey(walletSignature)
    expect(privateKey).toBe(starkPrivateKey)
    expect(calculateStarkPublicKey(privateKey)).toBe(starkPublicKey)
  })
})

describe('signStarkHash', () => {
  it.each(
    starkCases.filter(({ signatures }) => signatures.length > 0)
  )('matches the Python SDK signatures: $label', async ({
    hashCalls,
    signatures,
  }) => {
    const signed = await Promise.all(
      hashCalls.map(({ hash }) =>
        signStarkHash(hash, signingKey.starkPrivateKey)
      )
    )
    for (const signature of signatures) {
      expect(signed).toContainEqual(signature)
    }
  })

  it.each(
    registrationCases
  )('matches the registration signature of the Python SDK', async ({
    starkMessage,
    payload,
  }) => {
    expect(
      await signStarkHash(starkMessage, signingKey.starkPrivateKey)
    ).toEqual(payload.l2Signature)
  })
})
