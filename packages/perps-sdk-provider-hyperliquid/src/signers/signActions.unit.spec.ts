import { createMemoryStorage } from '@lifi/perps-sdk'
import type {
  Eip712ActionStep,
  Eip712SignedActionStep,
} from '@lifi/perps-types'
import { ActionType, SigningMethod } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { recoverTypedDataAddress } from 'viem'
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
      ADDRESS
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

  it('throws when no agent has been provisioned', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    await expect(
      hyperliquidSignActions(
        store,
        SigningMethod.EIP712,
        [eip712Step()],
        ADDRESS
      )
    ).rejects.toThrow('Agent not found')
  })

  it('rejects non-EIP712 signing methods', async () => {
    const store = new HyperliquidAgentStore(createMemoryStorage())
    await store.getOrCreate(ADDRESS)

    await expect(
      hyperliquidSignActions(store, SigningMethod.WASM_BLOB, [], ADDRESS)
    ).rejects.toThrow(/only signs the EIP712 agent arm/)
  })
})
