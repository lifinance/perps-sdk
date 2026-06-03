import type {
  ActionStep,
  Eip712ActionStep,
  Eip712SignedActionStep,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import { PerpsErrorCode } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PerpsError } from '../src/errors/PerpsError.js'
import type { PerpsProviderPlugin } from '../src/types/core.js'
import { signTypedData } from '../src/utils/signTypedData.js'

/**
 * Minimal in-memory stand-in for the Hyperliquid provider's agent ownership.
 * Implements just the agent-session surface core's signing pipeline delegates
 * to — `resolveSignerAddress` and the EIP712 arm of `signActions` — so the
 * PerpsClient unit tests can exercise core's delegation without importing the
 * real provider package (which would create a dev-time cyclic dependency).
 */
export interface TestAgentProvider extends PerpsProviderPlugin {
  createAgent(address: Address): Promise<Address>
}

export function createTestAgentProvider(
  partial: Partial<PerpsProviderPlugin> & { type: string }
): TestAgentProvider {
  const agents = new Map<string, Hex>()

  const requireAgent = (address: Address): Hex => {
    const key = address.toLowerCase()
    const pk = agents.get(key)
    if (pk === undefined) {
      throw new PerpsError(PerpsErrorCode.SDKError, 'Agent not found')
    }
    return pk
  }

  const createAgent = (address: Address): Promise<Address> => {
    const pk = generatePrivateKey()
    agents.set(address.toLowerCase(), pk)
    return Promise.resolve(privateKeyToAccount(pk).address)
  }

  return {
    bind: () => {},
    ...partial,
    type: partial.type,
    createAgent,
    resolveSignerAddress: async (
      address: Address,
      options?: { create?: boolean }
    ): Promise<Address> => {
      if (options?.create && !agents.has(address.toLowerCase())) {
        return createAgent(address)
      }
      return privateKeyToAccount(requireAgent(address)).address
    },
    signActions: (
      _method: SigningMethod,
      steps: ActionStep[],
      address: Address
    ): Promise<SignedActionStep[]> => {
      const pk = requireAgent(address)
      return Promise.all(
        (steps as Eip712ActionStep[]).map(
          async (step): Promise<Eip712SignedActionStep> => ({
            action: step.action,
            typedData: step.typedData,
            signature: await signTypedData(pk, step.typedData),
          })
        )
      )
    },
  } as TestAgentProvider
}
