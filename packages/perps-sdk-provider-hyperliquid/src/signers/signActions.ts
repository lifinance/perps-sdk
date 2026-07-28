import {
  PerpsError,
  type SignActionsContext,
  signTypedData,
  signTypedDataWithSigner,
} from '@lifi/perps-sdk'
import type {
  ActionStep,
  Eip712ActionStep,
  Eip712SignedActionStep,
  SignedActionStep,
} from '@lifi/perps-types'
import { PerpsErrorCode, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import type { HyperliquidAgentStore } from './HyperliquidAgentStore.js'

/**
 * Sign a batch of Hyperliquid EIP-712 action steps. `AGENT` descriptors use
 * the persisted per-user agent keypair; `USER` descriptors use
 * `ctx.userWallet`. Other signing methods are rejected because Hyperliquid
 * declares no WASM_BLOB or EVM_TX action schemes.
 *
 * @throws {PerpsError} When the method is unsupported, the required agent is
 * missing, or a user-signed action has no wallet.
 * @public
 */
export async function hyperliquidSignActions(
  agentStore: HyperliquidAgentStore,
  method: SigningMethod,
  steps: ActionStep[],
  address: Address,
  ctx: SignActionsContext | undefined
): Promise<SignedActionStep[]> {
  if (method !== SigningMethod.EIP712) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `hyperliquidProvider.signActions: unsupported SigningMethod '${method}'. ` +
        'Hyperliquid only signs EIP712 actions.'
    )
  }

  const sign = ctx?.signers?.includes(PerpsSigner.USER)
    ? await userWalletSigner(ctx)
    : await agentSigner(agentStore, address)

  return Promise.all(
    (steps as Eip712ActionStep[]).map(
      async (step): Promise<Eip712SignedActionStep> => ({
        action: step.action,
        typedData: step.typedData,
        signature: await sign(step),
      })
    )
  )
}

type SignStep = (step: Eip712ActionStep) => Promise<Hex>

async function agentSigner(
  agentStore: HyperliquidAgentStore,
  address: Address
): Promise<SignStep> {
  const agent = await agentStore.get(address)
  return (step) => signTypedData(agent.privateKey, step.typedData)
}

function userWalletSigner(ctx: SignActionsContext): Promise<SignStep> {
  const wallet = ctx.userWallet
  if (!wallet) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'hyperliquidProvider.signActions: a USER-signed action requires the ' +
        'end-user wallet. Pass `userWallet` to createPerpsClient or call ' +
        'setUserWallet(walletClient).'
    )
  }
  return Promise.resolve((step) =>
    signTypedDataWithSigner(wallet, step.typedData)
  )
}
