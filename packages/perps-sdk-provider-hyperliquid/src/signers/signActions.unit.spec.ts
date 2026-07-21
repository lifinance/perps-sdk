import { createMemoryStorage } from '@lifi/perps-sdk'
import type {
  Eip712ActionStep,
  Eip712SignedActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import type { Account, Address, Hex, WalletClient } from 'viem'
import { createWalletClient, http, recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { HyperliquidAgentStore } from './HyperliquidAgentStore.js'
import { hyperliquidSignActions } from './signActions.js'

const ADDRESS: Address = '0x1234567890123456789012345678901234567890'

const eip712Step = (): Eip712ActionStep => ({
  action: ActionType.PLACE_ORDER,
  typedData: {
    domain: { name: 'HL', chainId: 1 },
    types: { Agent: [{ name: 'who', type: 'address' }] },
    primaryType: 'Agent',
    message: { who: '0x0000000000000000000000000000000000000000' },
  },
})

describe('hyperliquidSignActions', () => {
  it('signs EIP712 steps with the stored agent key (recoverable to the agent)', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    const agent = await store.getOrCreate(ADDRESS)

    const step = eip712Step()
    const [signed] = (await hyperliquidSignActions(
      store,
      SigningMethod.EIP712,
      [step],
      ADDRESS,
      { signers: [PerpsSigner.SDK] }
    )) as Eip712SignedActionStep[]

    expect(signed.action).toBe(step.action)
    expect(signed.typedData).toEqual(step.typedData)
    expect(signed.signature).toMatch(/^0x[0-9a-f]+$/i)

    const recovered = await recoverTypedDataAddress({
      domain: step.typedData.domain,
      types: step.typedData.types as never,
      primaryType: step.typedData.primaryType as never,
      message: step.typedData.message,
      signature: signed.signature as Hex,
    })
    expect(recovered.toLowerCase()).toBe(agent.address.toLowerCase())
  })

  it('signs the USER arm with the end-user wallet (recoverable to the user)', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    // No agent provisioned: a USER-signed action must not touch the agent.
    const userKey = `0x${'22'.repeat(32)}` as Hex
    const userAccount = privateKeyToAccount(userKey)
    const userWallet = createWalletClient({
      account: userAccount,
      chain: mainnet,
      transport: http(),
    }) as WalletClient<never, never, Account>

    const step = eip712Step()
    const [signed] = (await hyperliquidSignActions(
      store,
      SigningMethod.EIP712,
      [step],
      ADDRESS,
      { signers: [PerpsSigner.USER], userWallet }
    )) as Eip712SignedActionStep[]

    const recovered = await recoverTypedDataAddress({
      domain: step.typedData.domain,
      types: step.typedData.types as never,
      primaryType: step.typedData.primaryType as never,
      message: step.typedData.message,
      signature: signed.signature as Hex,
    })
    expect(recovered.toLowerCase()).toBe(userAccount.address.toLowerCase())
  })

  it('throws when a USER-signed action has no end-user wallet', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    await expect(
      hyperliquidSignActions(
        store,
        SigningMethod.EIP712,
        [eip712Step()],
        ADDRESS,
        {
          signers: [PerpsSigner.USER],
        }
      )
    ).rejects.toThrow(/end-user wallet/)
  })

  it('throws when no agent has been provisioned for an agent-signed action', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    await expect(
      hyperliquidSignActions(
        store,
        SigningMethod.EIP712,
        [eip712Step()],
        ADDRESS,
        {
          signers: [PerpsSigner.SDK],
        }
      )
    ).rejects.toThrow('Agent not found')
  })

  it('rejects non-EIP712 signing methods', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    await store.getOrCreate(ADDRESS)

    await expect(
      hyperliquidSignActions(store, SigningMethod.WASM_BLOB, [], ADDRESS, {
        signers: [PerpsSigner.SDK],
      })
    ).rejects.toThrow(/only signs EIP712 actions/)
  })
})
