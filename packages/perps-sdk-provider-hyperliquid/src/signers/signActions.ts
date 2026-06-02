import { PerpsError, signTypedData } from '@lifi/perps-sdk'
import type {
  ActionStep,
  Eip712ActionStep,
  Eip712SignedActionStep,
  SignedActionStep,
} from '@lifi/perps-types'
import { PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import type { Address } from 'viem'
import type { HyperliquidAgentStore } from './HyperliquidAgentStore.js'

/**
 * Sign a batch of EIP-712 action steps with the user's Hyperliquid agent
 * keypair. The agent must already exist (it is provisioned and approved during
 * provider setup); a missing agent throws.
 *
 * Only the EIP712 AGENT arm is owned here — the EIP712 USER-wallet arm stays
 * generic on `PerpsClient`, and Hyperliquid declares no WASM_BLOB / EVM_TX
 * actions, so those arms reject.
 */
export async function hyperliquidSignActions(
  agentStore: HyperliquidAgentStore,
  method: SigningMethod,
  steps: ActionStep[],
  address: Address
): Promise<SignedActionStep[]> {
  if (method !== SigningMethod.EIP712) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `hyperliquidProvider.signActions: unsupported SigningMethod '${method}'. ` +
        'Hyperliquid only signs the EIP712 agent arm.'
    )
  }

  const agent = await agentStore.get(address)
  return Promise.all(
    (steps as Eip712ActionStep[]).map(
      async (step): Promise<Eip712SignedActionStep> => ({
        action: step.action,
        typedData: step.typedData,
        signature: await signTypedData(agent.privateKey, step.typedData),
      })
    )
  )
}
