import type { PerpsTypedData } from '@lifi/perps-types'
import {
  createWalletClient,
  type Hex,
  hashTypedData,
  http,
  recoverTypedDataAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { describe, expect, it } from 'vitest'
import { signTypedData, signTypedDataWithSigner } from './signTypedData.js'

// Deterministic test key (Anvil account #0) — never used for real funds.
const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const ACCOUNT = privateKeyToAccount(PRIVATE_KEY)

const typedData: PerpsTypedData = {
  domain: {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' },
    ],
  },
  primaryType: 'Agent',
  message: {
    source: 'a',
    connectionId: `0x${'ab'.repeat(32)}` as Hex,
  },
} as PerpsTypedData

describe('signTypedData', () => {
  it('produces a signature recoverable to the key address', async () => {
    const signature = await signTypedData(PRIVATE_KEY, typedData)

    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature,
    })

    expect(recovered.toLowerCase()).toBe(ACCOUNT.address.toLowerCase())
  })

  it('matches the EIP-712 digest signed directly by the account', async () => {
    const signature = await signTypedData(PRIVATE_KEY, typedData)
    const direct = await ACCOUNT.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
    })

    expect(signature).toBe(direct)
    // The signed payload is the canonical EIP-712 hash of the typed data.
    expect(
      hashTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      })
    ).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('signTypedDataWithSigner', () => {
  it('signs via a viem WalletClient and recovers to its account', async () => {
    const walletClient = createWalletClient({
      account: ACCOUNT,
      transport: http('http://localhost:8545'),
    })

    const signature = await signTypedDataWithSigner(walletClient, typedData)

    const recovered = await recoverTypedDataAddress({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      signature,
    })

    expect(recovered.toLowerCase()).toBe(ACCOUNT.address.toLowerCase())
  })

  it('agrees with the raw-key signer for the same payload', async () => {
    const walletClient = createWalletClient({
      account: ACCOUNT,
      transport: http('http://localhost:8545'),
    })

    const fromSigner = await signTypedDataWithSigner(walletClient, typedData)
    const fromKey = await signTypedData(PRIVATE_KEY, typedData)

    expect(fromSigner).toBe(fromKey)
  })
})
