import { PerpsError, type SignActionsContext } from '@lifi/perps-sdk'
import type {
  ActionStep,
  EvmTxActionStep,
  EvmTxSignedActionStep,
  SignedActionStep,
  WasmBlobActionStep,
  WasmBlobSignedActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import type { Address } from 'viem'
import { parseAbi } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { DEFAULT_API_KEY_INDEX } from '../constants.js'
import type { LighterApiKey, LighterKeyStore } from './LighterKeyStore.js'
import type { LighterSigner } from './LighterSigner.js'

/**
 * Per-batch dependencies the Lighter `signActions` implementation needs:
 * a WASM signer (`LighterSigner`), the API-key store keyed on L1 address,
 * and a reference to the host SDK client for descriptor/account fetches
 * within the REGISTER_API_KEY hybrid flow.
 * @internal
 */
export interface LighterSignActionsDeps {
  signer: LighterSigner
  keyStore: LighterKeyStore
  /**
   * Resolve the user's Lighter `accountIndex` for an L1 address. Required
   * by REGISTER_API_KEY so the ChangePubKey blob carries the right
   * account. Implementations typically call Lighter's `/api/v1/account`
   * with `by=l1_address`.
   */
  resolveAccountIndex(address: Address): Promise<number>
}

/**
 * Sign a `WASM_BLOB` batch (Lighter). Ensures the user's API keypair is
 * registered first — generating one and running the REGISTER_API_KEY
 * hybrid flow via the L1 signer if not — then feeds each subsequent step
 * through the WASM signer.
 *
 * `ACCOUNT_TYPE` (Lighter `/changeAccountTier`) is a WASM_BLOB envelope
 * authenticated with an auth token rather than a wasm tx signature —
 * created via `LighterSigner.createAuthToken` and parked in `signedTx.txInfo`.
 * @internal
 */
export async function signWasmBlobActions(
  deps: LighterSignActionsDeps,
  address: Address,
  steps: WasmBlobActionStep[],
  ctx: SignActionsContext | undefined
): Promise<WasmBlobSignedActionStep[]> {
  const signed: WasmBlobSignedActionStep[] = []
  for (const step of steps) {
    if (step.action === ActionType.REGISTER_API_KEY) {
      signed.push(await signRegisterApiKey(deps, address, step, ctx))
    } else if (step.action === ActionType.ACCOUNT_TYPE) {
      signed.push(await signAccountTierChange(deps, address, step))
    } else {
      signed.push(await signStandardWasmAction(deps, address, step))
    }
  }
  return signed
}

async function signStandardWasmAction(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep
): Promise<WasmBlobSignedActionStep> {
  const apiKey = await requireApiKey(deps, address)
  const signedTx = await deps.signer.sign(step.action, step.wasmSignParams, {
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  })
  return {
    action: step.action,
    wasmSignParams: step.wasmSignParams,
    signedTx,
  }
}

/**
 * REGISTER_API_KEY flow:
 *   1. Look up the user's Lighter accountIndex (Lighter REST).
 *   2. Generate a fresh Lighter API keypair via the WASM signer.
 *   3. Call SignChangePubKey to produce the WASM blob + EIP-191 message.
 *   4. Have the user's L1 Ethereum wallet sign the message.
 *   5. Inject the L1 signature into the ChangePubKey txInfo JSON.
 *   6. Persist the keypair and return the signed blob.
 *
 * Requires the end-user's wallet in `ctx.userWallet` — the L1 signature is the
 * user's consent to rotate keys.
 */
async function signRegisterApiKey(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep,
  ctx: SignActionsContext | undefined
): Promise<WasmBlobSignedActionStep> {
  const walletSigner = ctx?.userWallet
  if (!walletSigner) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'REGISTER_API_KEY requires the end-user wallet — pass `userWallet` to ' +
        'createPerpsClient or call setUserWallet(walletClient).'
    )
  }

  const params = step.wasmSignParams as {
    api_key_index?: number
    nonce?: number
    skip_nonce?: 0 | 1
  }
  const apiKeyIndex = params.api_key_index ?? DEFAULT_API_KEY_INDEX
  const nonce = params.nonce
  if (typeof nonce !== 'number') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'REGISTER_API_KEY wasmSignParams is missing `nonce`.'
    )
  }
  const skipNonce = params.skip_nonce === 1 ? 1 : 0

  const accountIndex = await deps.resolveAccountIndex(address)

  const keypair = await deps.signer.generateAPIKey()
  const changePubKey = await deps.signer.signChangePubKey(
    keypair.publicKey,
    keypair.privateKey,
    nonce,
    apiKeyIndex,
    accountIndex,
    skipNonce
  )

  const l1Signature = await walletSigner.signMessage({
    account: walletSigner.account,
    message: changePubKey.messageToSign,
  })

  const txInfoWithL1Sig = deps.signer.embedL1Signature(
    changePubKey.txInfo,
    l1Signature
  )

  const apiKey: LighterApiKey = {
    accountIndex,
    apiKeyIndex,
    apiKeyPrivateKey: keypair.privateKey,
    apiKeyPublicKey: keypair.publicKey,
  }
  await deps.keyStore.set(address, apiKey)

  return {
    action: step.action,
    wasmSignParams: {
      ...step.wasmSignParams,
      new_public_key: keypair.publicKey,
    },
    signedTx: {
      txType: changePubKey.txType,
      txInfo: txInfoWithL1Sig,
      txHash: changePubKey.txHash,
    },
  }
}

/**
 * Sign an `ACCOUNT_TYPE` step (Lighter `changeAccountTier`).
 *
 * Lighter's `/api/v1/changeAccountTier` is an HTTP-only mutation —
 * Lighter does NOT consume a wasm-signed transaction here; it
 * authenticates the request with the same auth token its read endpoints
 * use, and enforces anti-replay business rules server-side. The backend
 * declares the step as a `WasmBlobActionStep` with
 * `wasmSignParams.kind = 'changeAccountTier'` and expects the SDK to create
 * an auth token in lieu of a transaction signature; the executor reads
 * `signedTx.txInfo` as the `auth` form parameter.
 *
 * The 1h deadline mirrors the previous behaviour — Lighter caps tokens at
 * 8h hard, and the backend's executor runs `verifyPendingAction` then a
 * single POST, which completes well inside an hour.
 */
async function signAccountTierChange(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep
): Promise<WasmBlobSignedActionStep> {
  const apiKey = await requireApiKey(deps, address)
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60
  const authToken = await deps.signer.createAuthToken(deadline, {
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  })
  return {
    action: step.action,
    wasmSignParams: step.wasmSignParams,
    signedTx: {
      // `/changeAccountTier` reads only `txInfo` (the auth token); `txType`
      // and `txHash` are placeholders to satisfy the envelope shape.
      txType: 0,
      txInfo: authToken,
      txHash: '',
    },
  }
}

async function requireApiKey(
  deps: LighterSignActionsDeps,
  address: Address
): Promise<LighterApiKey> {
  const apiKey = await deps.keyStore.get(address)
  if (!apiKey) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `No Lighter API key registered for ${address}. ` +
        'Run prepareAccount / REGISTER_API_KEY first.'
    )
  }
  return apiKey
}

/**
 * Sign and broadcast a sequence of `EVM_TX` actions via the user's wallet
 * client. Each leg is broadcast then confirmed to a successful receipt before
 * the next is broadcast, so a later step (e.g. deposit) can rely on an earlier
 * step (e.g. approve) having mined. A reverted leg throws and aborts the
 * remaining legs. Each step's `txParams` carries chainId, target, function
 * name, args, and a human-readable abi from the backend.
 *
 * The wallet MUST already be on the leg's `txParams.chainId`: this signer
 * broadcasts on the wallet's active chain and never switches it (switching is
 * the integrator's responsibility — the widget drives it before signing). A leg
 * whose target chain differs from the wallet's chain throws before broadcasting,
 * so a token approve/deposit can never land on an unintended chain.
 * @internal
 */
export async function signEvmTxActions(
  steps: EvmTxActionStep[],
  ctx: SignActionsContext | undefined
): Promise<EvmTxSignedActionStep[]> {
  const walletSigner = ctx?.userWallet
  if (!walletSigner) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'EVM_TX signing requires the end-user wallet. Pass `userWallet` to ' +
        'createPerpsClient or call setUserWallet(walletClient).'
    )
  }

  const signed: EvmTxSignedActionStep[] = []
  for (const step of steps) {
    const params = step.txParams

    if (walletSigner.chain?.id !== params.chainId) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `EVM_TX leg '${step.action}' targets chain ${params.chainId}, but the ` +
          `connected wallet is on chain ${walletSigner.chain?.id ?? 'unknown'}. ` +
          `Switch the wallet to chain ${params.chainId} before signing — the ` +
          "SDK broadcasts on the wallet's active chain and does not switch it."
      )
    }

    const txHash = await walletSigner.writeContract({
      address: params.to,
      abi: parseAbi(params.abi),
      functionName: params.functionName,
      args: params.args,
      chain: walletSigner.chain,
      account: walletSigner.account,
    })

    const receipt = await waitForTransactionReceipt(walletSigner, {
      hash: txHash,
    })
    if (receipt.status === 'reverted') {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `EVM_TX leg '${step.action}' reverted (tx ${txHash}); aborting the ` +
          'remaining legs.'
      )
    }

    signed.push({
      action: step.action,
      txParams: step.txParams,
      txHash,
    })
  }

  return signed
}

/**
 * Top-level dispatch: pick the per-method signer based on the descriptor's
 * `signingMethod` and forward. `EIP712` is rejected — Lighter declares no
 * EIP712 actions (its user-consent step uses an EIP-191 `signMessage` inside
 * the `WASM_BLOB` REGISTER_API_KEY flow).
 * @internal
 */
export async function lighterSignActions(
  deps: LighterSignActionsDeps,
  method: SigningMethod,
  steps: ActionStep[],
  address: Address,
  ctx?: SignActionsContext
): Promise<SignedActionStep[]> {
  switch (method) {
    case SigningMethod.WASM_BLOB:
      return signWasmBlobActions(
        deps,
        address,
        steps as WasmBlobActionStep[],
        ctx
      )
    case SigningMethod.EVM_TX:
      return signEvmTxActions(steps as EvmTxActionStep[], ctx)
    case SigningMethod.EIP712:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'LighterProvider.signActions: Lighter declares no EIP712 actions.'
      )
    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `LighterProvider.signActions: unknown SigningMethod '${method as string}'.`
      )
  }
}
