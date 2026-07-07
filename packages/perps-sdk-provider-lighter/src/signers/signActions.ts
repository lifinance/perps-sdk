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
import {
  DEFAULT_API_KEY_INDEX,
  LIGHTER_MUTATION_SUCCESS_CODE,
} from '../constants.js'
import type { ApiParams, LighterApiClient } from '../utils/apiClient.js'
import type { LighterApiKey, LighterKeyStore } from './LighterKeyStore.js'
import type { LighterSigner } from './LighterSigner.js'

/**
 * Per-batch dependencies the Lighter `signActions` implementation needs:
 * a WASM signer (`LighterSigner`), the API-key store keyed on L1 address,
 * a REST client for the token-authenticated venue mutations that execute
 * client-side, and a reference to the host SDK client for descriptor/account
 * fetches within the REGISTER_API_KEY hybrid flow.
 * @internal
 */
export interface LighterSignActionsDeps {
  signer: LighterSigner
  keyStore: LighterKeyStore
  /** REST client bound to the user's Lighter base URL, used for the direct
   * `changeAccountTier` / `referral/use` POSTs so their auth token never
   * transits the LI.FI backend. */
  apiClient: LighterApiClient
  /**
   * Resolve the user's Lighter `accountIndex` for an L1 address. Required
   * by REGISTER_API_KEY so the ChangePubKey blob carries the right
   * account. Implementations typically call Lighter's `/api/v1/account`
   * with `by=l1_address`.
   */
  resolveAccountIndex(address: Address): Promise<number>
}

/**
 * `wasmSignParams.kind` values for the Lighter mutations that authenticate with
 * a short-lived auth token instead of a wasm-signed transaction. Both execute
 * client-side (SDK → Lighter REST) so the token never reaches the backend.
 * @internal
 */
const TOKEN_AUTH_MUTATION_KINDS = new Set(['changeAccountTier', 'referralUse'])

/**
 * Lifetime of the per-call auth token minted for a token-authenticated venue
 * mutation. Minutes, not the read endpoints' hours: it authenticates one POST
 * that completes immediately, so it never lingers usable.
 */
const TOKEN_AUTH_MUTATION_DEADLINE_SECONDS = 5 * 60

/**
 * Sign a `WASM_BLOB` batch (Lighter). Ensures the user's API keypair is
 * registered first — generating one and running the REGISTER_API_KEY
 * hybrid flow via the L1 signer if not — then feeds each subsequent step
 * through the WASM signer.
 *
 * The token-authenticated mutations (`ACCOUNT_TYPE` → `/changeAccountTier`,
 * `SET_REFERRAL` → `/referral/use`) are NOT wasm-signed: they execute
 * client-side here via a direct Lighter POST authenticated with a short-lived
 * auth token, so the token never transits the LI.FI backend. They produce no
 * backend-bound step and are omitted from the returned array.
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
    } else if (
      TOKEN_AUTH_MUTATION_KINDS.has(step.wasmSignParams.kind as string)
    ) {
      await executeTokenAuthMutation(deps, address, step)
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
 * Execute a token-authenticated Lighter mutation (`ACCOUNT_TYPE` →
 * `/changeAccountTier`, `SET_REFERRAL` → `/referral/use`) client-side.
 *
 * Neither endpoint consumes a wasm-signed transaction — both authenticate with
 * a Lighter auth token and enforce their business rules (open positions,
 * pending orders, 24h tier cooldown) server-side. We mint a fresh short-lived
 * token per call (never the stored read-only token, never persisted) and POST
 * the mirror of the backend's form body directly to Lighter, so no auth token
 * ever transits the LI.FI backend. A non-success verdict surfaces Lighter's
 * `code`/`message` verbatim as an {@link PerpsErrorCode.ExchangeRejected}.
 */
async function executeTokenAuthMutation(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep
): Promise<void> {
  const apiKey = await requireApiKey(deps, address)
  const deadline =
    Math.floor(Date.now() / 1000) + TOKEN_AUTH_MUTATION_DEADLINE_SECONDS
  const authToken = await deps.signer.createAuthToken(deadline, {
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  })

  const { path, params } = buildTokenAuthMutationRequest(step, authToken)
  const { status, data } = await deps.apiClient.postForm<{
    code?: number
    message?: string
  }>(path, params)

  const code = data?.code
  if (status < 200 || status >= 300 || code !== LIGHTER_MUTATION_SUCCESS_CODE) {
    const suffix = data?.message ? `: ${data.message}` : ''
    throw new PerpsError(
      PerpsErrorCode.ExchangeRejected,
      `Lighter ${step.action} rejected (code ${code ?? status})${suffix}`
    )
  }
}

/**
 * Map a token-authenticated mutation step to its Lighter endpoint and
 * form body, mirroring the backend's request contract. The auth token is the
 * `auth` field; the remaining fields come from `wasmSignParams`.
 */
function buildTokenAuthMutationRequest(
  step: WasmBlobActionStep,
  authToken: string
): { path: string; params: ApiParams } {
  const kind = step.wasmSignParams.kind
  if (kind === 'changeAccountTier') {
    const { account_index, new_tier } = step.wasmSignParams as {
      account_index?: number
      new_tier?: string
    }
    if (account_index === undefined || new_tier === undefined) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Lighter ACCOUNT_TYPE wasmSignParams missing account_index or new_tier'
      )
    }
    return {
      path: '/api/v1/changeAccountTier',
      params: { auth: authToken, account_index, new_tier },
    }
  }
  if (kind === 'referralUse') {
    const { l1_address, referral_code, x } = step.wasmSignParams as {
      l1_address?: string
      referral_code?: string
      x?: string
    }
    if (
      l1_address === undefined ||
      referral_code === undefined ||
      x === undefined
    ) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Lighter SET_REFERRAL wasmSignParams missing l1_address, referral_code, or x'
      )
    }
    return {
      path: '/api/v1/referral/use',
      params: { auth: authToken, l1_address, referral_code, x },
    }
  }
  throw new PerpsError(
    PerpsErrorCode.SDKError,
    `Lighter token-auth mutation: unknown wasmSignParams.kind '${String(kind)}'`
  )
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
