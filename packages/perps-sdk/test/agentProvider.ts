import type {
  ActionStep,
  ActionType,
  Eip712ActionStep,
  Eip712SignedActionStep,
  PerpsSigner as PerpsSignerType,
  SignedActionStep,
  SigningMethod,
} from '@lifi/perps-types'
import { PerpsErrorCode, PerpsSigner } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { PerpsError } from '../src/errors/PerpsError.js'
import type {
  ActionSignerContribution,
  PerpsProviderPlugin,
  SignActionsContext,
} from '../src/types/core.js'
import { signTypedData } from '../src/utils/signTypedData.js'

/**
 * Minimal in-memory stand-in for an agent-owning provider plugin. Implements
 * the signer-identity + signing surface core delegates to —
 * `resolveActionRequest` and the EIP712 arm of `signActions` — so the
 * PerpsClient unit tests can exercise core's delegation without importing the
 * real provider package (which would create a dev-time cyclic dependency).
 *
 * Branches on the descriptor `signers` core forwards: `AGENT`-signed actions
 * resolve + sign with the in-memory agent keypair; `USER`-signed actions sign
 * with `ctx.userWallet` and contribute no `signerAddress`.
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

  const agentAddress = (address: Address): Address =>
    privateKeyToAccount(requireAgent(address)).address

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
    resolveActionRequest: async (
      action: ActionType,
      address: Address,
      signers: PerpsSignerType[]
    ): Promise<ActionSignerContribution> => {
      // Mirror the real Hyperliquid plugin: APPROVE_AGENT is user-signed and
      // contributes the agent address as a param; other agent-signed actions
      // carry the agent as signerAddress.
      if ((action as string) === 'approveAgent') {
        if (!agents.has(address.toLowerCase())) {
          await createAgent(address)
        }
        return { params: { agentAddress: agentAddress(address) } }
      }
      if (signers.includes(PerpsSigner.AGENT)) {
        return { signerAddress: agentAddress(address) }
      }
      return {}
    },
    signActions: (
      _method: SigningMethod,
      steps: ActionStep[],
      address: Address,
      ctx?: SignActionsContext
    ): Promise<SignedActionStep[]> => {
      const signEip712 = ctx?.signers?.includes(PerpsSigner.USER)
        ? (step: Eip712ActionStep): Promise<Hex> => {
            const wallet = ctx.userWallet
            if (!wallet) {
              throw new PerpsError(
                PerpsErrorCode.SDKError,
                'USER-signed action requires userWallet'
              )
            }
            return wallet.signTypedData({
              account: wallet.account,
              domain: step.typedData.domain,
              types: step.typedData.types,
              primaryType: step.typedData.primaryType,
              message: step.typedData.message,
            })
          }
        : (step: Eip712ActionStep): Promise<Hex> =>
            signTypedData(requireAgent(address), step.typedData)
      return Promise.all(
        (steps as Eip712ActionStep[]).map(
          async (step): Promise<Eip712SignedActionStep> => ({
            action: step.action,
            typedData: step.typedData,
            signature: await signEip712(step),
          })
        )
      )
    },
  } as TestAgentProvider
}
