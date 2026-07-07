import type {
  ActionStep,
  Eip712ActionStep,
  ProviderAction,
} from '@lifi/perps-types'
import { PerpsErrorCode, PerpsSigner, SigningMethod } from '@lifi/perps-types'
import { getChainId } from 'viem/actions'
import { PerpsError } from '../errors/PerpsError.js'
import type { PerpsClientSigner, SwitchChainHook } from '../types/config.js'

/**
 * The chain a batch of `actions` must be signed on, or `undefined` when no
 * wallet chain switch applies. Only USER-signed EIP-712 batches carry a target
 * (agent-signed batches sign with a chain-bound keypair; other schemes are not
 * EIP-712). Reads the first numeric `typedData.domain.chainId`; a batch whose
 * steps omit `chainId` yields `undefined`.
 */
export function userEip712TargetChainId(
  descriptor: ProviderAction,
  actions: ActionStep[]
): number | undefined {
  if (
    descriptor.signingMethod !== SigningMethod.EIP712 ||
    !descriptor.signers.includes(PerpsSigner.USER)
  ) {
    return undefined
  }
  for (const step of actions) {
    const chainId = (step as Eip712ActionStep).typedData?.domain?.chainId
    if (typeof chainId === 'number') {
      return chainId
    }
  }
  return undefined
}

/**
 * Ensure `wallet` is on `targetChainId` before signing, returning the wallet to
 * sign with. Without a `switchChain` hook the wallet is returned unchanged (no
 * throw, no RPC) — a local/private-key signer signs EIP-712 offline regardless
 * of its transport chain. With a hook: probe the current chain via viem
 * `getChainId`, return the wallet untouched when already on target, else invoke
 * the hook and re-verify. Throws `PerpsErrorCode.SDKError` when the hook yields
 * no client or a client still on the wrong chain.
 */
export async function switchSigningChain(
  wallet: PerpsClientSigner,
  targetChainId: number,
  switchChain?: SwitchChainHook
): Promise<PerpsClientSigner> {
  if (!switchChain) {
    return wallet
  }
  const currentChainId = await getChainId(wallet)
  if (currentChainId === targetChainId) {
    return wallet
  }
  const switched = await switchChain(targetChainId)
  if (!switched) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Wallet chain switch to ${targetChainId} was not completed.`
    )
  }
  const switchedChainId = await getChainId(switched)
  if (switchedChainId !== targetChainId) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Wallet is on chain ${switchedChainId} but chain ${targetChainId} is required to sign.`
    )
  }
  return switched
}
