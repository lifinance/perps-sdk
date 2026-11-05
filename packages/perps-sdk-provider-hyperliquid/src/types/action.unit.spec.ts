import { signTypedDataWithSigner } from '@lifi/perps-sdk'
import type { PerpsTypedData } from '@lifi/perps-types'
import type { TypedDataParameter } from 'viem'
import { createWalletClient, http, recoverTypedDataAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arbitrum } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION,
  HL_PRIMARY_TYPE_APPROVE_AGENT,
  HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE,
  HL_PRIMARY_TYPE_SEND_ASSET,
  HL_PRIMARY_TYPE_USER_SET_ABSTRACTION,
  HL_PRIMARY_TYPE_WITHDRAW,
  type HlPrimaryType,
} from './action.js'

const USER_ACCOUNT = privateKeyToAccount(generatePrivateKey())
const USER_WALLET = createWalletClient({
  account: USER_ACCOUNT,
  chain: arbitrum,
  transport: http(),
})

const NONCE = 1_700_000_000_000

const userSignedTypedData = (
  primaryType: HlPrimaryType,
  fields: readonly TypedDataParameter[],
  message: Record<string, unknown>
): PerpsTypedData => ({
  domain: {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: 42161,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    [primaryType]: [{ name: 'hyperliquidChain', type: 'string' }, ...fields],
  },
  primaryType,
  message: { hyperliquidChain: 'Mainnet', ...message },
})

const USER_SIGNED_TYPED_DATA: PerpsTypedData[] = [
  userSignedTypedData(
    HL_PRIMARY_TYPE_APPROVE_AGENT,
    [
      { name: 'agentAddress', type: 'address' },
      { name: 'agentName', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
    {
      agentAddress: '0x1234567890123456789012345678901234567890',
      agentName: 'lifi valid_until 1800000000000',
      nonce: NONCE,
    }
  ),
  userSignedTypedData(
    HL_PRIMARY_TYPE_APPROVE_BUILDER_FEE,
    [
      { name: 'maxFeeRate', type: 'string' },
      { name: 'builder', type: 'address' },
      { name: 'nonce', type: 'uint64' },
    ],
    {
      maxFeeRate: '0.1%',
      builder: '0x1234567890123456789012345678901234567890',
      nonce: NONCE,
    }
  ),
  userSignedTypedData(
    HL_PRIMARY_TYPE_USER_SET_ABSTRACTION,
    [
      { name: 'user', type: 'address' },
      { name: 'abstraction', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
    {
      user: USER_ACCOUNT.address,
      abstraction: 'unifiedAccount',
      nonce: NONCE,
    }
  ),
  userSignedTypedData(
    HL_PRIMARY_TYPE_AGENT_SET_ABSTRACTION,
    [
      { name: 'abstraction', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
    { abstraction: 'u', nonce: NONCE }
  ),
  userSignedTypedData(
    HL_PRIMARY_TYPE_WITHDRAW,
    [
      { name: 'destination', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'time', type: 'uint64' },
    ],
    {
      destination: USER_ACCOUNT.address,
      amount: '10',
      time: NONCE,
    }
  ),
  userSignedTypedData(
    HL_PRIMARY_TYPE_SEND_ASSET,
    [
      { name: 'destination', type: 'string' },
      { name: 'sourceDex', type: 'string' },
      { name: 'destinationDex', type: 'string' },
      { name: 'token', type: 'string' },
      { name: 'amount', type: 'string' },
      { name: 'fromSubAccount', type: 'string' },
      { name: 'nonce', type: 'uint64' },
    ],
    {
      destination: USER_ACCOUNT.address,
      sourceDex: 'spot',
      destinationDex: '',
      token: 'USDC:0x6d1e7cde53ba9467b783cb7c530ce054',
      amount: '10',
      fromSubAccount: '',
      nonce: NONCE,
    }
  ),
]

describe('Hyperliquid user-signed primary types', () => {
  it.each(
    USER_SIGNED_TYPED_DATA.map((typedData) => [
      typedData.primaryType,
      typedData,
    ])
  )('%s signs with a viem wallet client and recovers to the user', async (_, typedData) => {
    const signature = await signTypedDataWithSigner(USER_WALLET, typedData)

    const recovered = await recoverTypedDataAddress({
      ...typedData,
      signature,
    })
    expect(recovered).toBe(USER_ACCOUNT.address)
  })
})
