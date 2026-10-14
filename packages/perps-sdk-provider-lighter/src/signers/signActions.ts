import {
  PerpsError,
  rethrowWithKnownResults,
  type SignActionsContext,
  type SignActionsResult,
} from '@lifi/perps-sdk'
import type {
  ActionResult,
  ActionStep,
  EvmTxActionStep,
  EvmTxSignedActionStep,
  WasmBlobActionStep,
  WasmBlobSignedActionStep,
} from '@lifi/perps-types'
import {
  ActionType,
  PerpsErrorCode,
  SigningMethod,
  UserActionStatus,
} from '@lifi/perps-types'
import type { Address, Hex } from 'viem'
import { parseAbi, WaitForTransactionReceiptTimeoutError } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import {
  LIGHTER_MUTATION_SUCCESS_CODE,
  LIGHTER_REFERRAL_ALREADY_USED_CODE,
} from '../constants.js'
import {
  rejectedFailedErrorText,
  revertedFailedErrorText,
  unconfirmedIndeterminateErrorText,
} from '../copy.js'
import type { ApiParams, LighterApiClient } from '../utils/apiClient.js'
import { fetchAppliedReferralCode } from '../utils/appliedReferralCode.js'
import { lighterErrorCodeFromBody } from '../utils/lighterErrorCode.js'
import {
  fetchRegisteredApiKey,
  type LighterRegisteredApiKey,
  normalizeLighterPublicKey,
} from '../utils/registeredApiKey.js'
import type { LighterApiKey, LighterKeyStore } from './LighterKeyStore.js'
import type {
  LighterL1CountersignedAction,
  LighterSigner,
} from './LighterSigner.js'

/**
 * Per-batch dependencies the Lighter `signActions` implementation needs:
 * the provider instance's WASM signer, its API-key store keyed on L1 address,
 * a REST client for the token-authenticated venue mutations that execute
 * client-side, and an `accountIndex` resolver for the REGISTER_API_KEY
 * hybrid flow.
 *
 * @internal
 */
export interface LighterSignActionsDeps {
  /** Provider key (`lighter` or `lighter-rh`) named in result texts. */
  providerKey: string
  signer: LighterSigner
  keyStore: LighterKeyStore
  /** REST client bound to the user's Lighter base URL, used for the direct
   * `changeAccountTier` / `referral/use` POSTs so their auth token never
   * transits the LI.FI backend. */
  apiClient: LighterApiClient
  /**
   * Pre-sign guard that the stored API key still occupies its venue slot.
   * Created once per provider instance so its freshness window spans batches.
   */
  apiKeyFreshness: LighterApiKeyFreshness
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
 * Window in which one `/apikeys` read stands for the next. 30s keeps a burst
 * of batches — several orders submitted back to back, a close-then-reduce
 * sequence — at one read, and still surfaces a key rotated on another device
 * on the user's next action instead of after a venue rejection.
 */
const API_KEY_FRESHNESS_WINDOW_MS = 30_000

/**
 * Pre-sign guard that the stored Lighter API key is still the key registered
 * in its venue slot. Owns the freshness window, so one instance is created per
 * provider instance and shared by every batch that instance signs.
 *
 * @internal
 */
export interface LighterApiKeyFreshness {
  assertStillRegistered(
    client: LighterApiClient,
    address: Address,
    apiKey: LighterApiKey
  ): Promise<void>
}

/**
 * Build the guard {@link LighterSignActionsDeps.apiKeyFreshness} needs.
 *
 * @internal
 */
export const createLighterApiKeyFreshness = (): LighterApiKeyFreshness => {
  const checkedAtMs = new Map<string, number>()
  return {
    async assertStillRegistered(client, address, apiKey) {
      const storedKey = normalizeLighterPublicKey(apiKey.apiKeyPublicKey)
      // Keyed on the stored key, so a rotation retires the entry by itself.
      const windowKey = `${apiKey.accountIndex}:${apiKey.apiKeyIndex}:${storedKey}`
      const checkedAt = checkedAtMs.get(windowKey)
      if (
        checkedAt !== undefined &&
        Date.now() - checkedAt < API_KEY_FRESHNESS_WINDOW_MS
      ) {
        return
      }

      let registered: LighterRegisteredApiKey | undefined
      try {
        registered = await fetchRegisteredApiKey(
          client,
          apiKey.accountIndex,
          apiKey.apiKeyIndex
        )
      } catch (err) {
        // A transport failure or a non-success body proves nothing about the
        // slot, so the venue decides. A failed check never blocks a signature.
        // The code names the failure without the response body, which lists
        // the account's other key slots.
        console.warn(
          '[lighter] could not read the registered API key before signing; ' +
            'signing anyway and letting the venue decide.',
          err instanceof PerpsError ? err.code : String(err)
        )
        checkedAtMs.set(windowKey, Date.now())
        return
      }
      // An answered read that names no entry is a verdict, not a gap: the slot
      // holds no key the stored one can match, so a signature it produces
      // cannot verify.
      if (registered === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `The Lighter API key stored for ${address} is not registered: ` +
            `account ${apiKey.accountIndex} holds no key in API-key slot ` +
            `${apiKey.apiKeyIndex}. Run prepareAccount / REGISTER_API_KEY to ` +
            'register a fresh key.'
        )
      }
      if (normalizeLighterPublicKey(registered.public_key) !== storedKey) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `The Lighter API key stored for ${address} is no longer registered: ` +
            `API-key slot ${apiKey.apiKeyIndex} now holds a different key. ` +
            'Run prepareAccount / REGISTER_API_KEY to register a fresh key.'
        )
      }
      // Every read the venue answered counts against the window, so a burst
      // costs one read whatever the verdict. A rejection throws above, so it
      // never records and the next batch reads again.
      checkedAtMs.set(windowKey, Date.now())
    },
  }
}

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
 * backend-bound step: each one that sends reports its result in `executed`,
 * and signing stops at the first one without an `Accepted` result.
 * @internal
 */
export async function signWasmBlobActions(
  deps: LighterSignActionsDeps,
  address: Address,
  steps: WasmBlobActionStep[],
  ctx: SignActionsContext | undefined
): Promise<SignActionsResult> {
  // REGISTER_API_KEY replaces the slot's key, so for such a batch the stored
  // key is expected to differ from the registered one.
  const replacesApiKey = steps.some(
    (step) => step.action === ActionType.REGISTER_API_KEY
  )
  if (!replacesApiKey) {
    const storedKey = await deps.keyStore.get(address)
    if (storedKey !== null) {
      await deps.apiKeyFreshness.assertStillRegistered(
        deps.apiClient,
        address,
        storedKey
      )
    }
  }

  const signed: WasmBlobSignedActionStep[] = []
  const executed: ActionResult[] = []
  try {
    for (const step of steps) {
      if (step.action === ActionType.REGISTER_API_KEY) {
        signed.push(await signRegisterApiKey(deps, address, step, ctx))
      } else if (step.action === ActionType.APPROVE_INTEGRATOR) {
        signed.push(await signApproveIntegrator(deps, address, step, ctx))
      } else if (step.action === ActionType.TRANSFER) {
        signed.push(await signTransfer(deps, address, step, ctx))
      } else if (
        TOKEN_AUTH_MUTATION_KINDS.has(step.wasmSignParams.kind as string)
      ) {
        const result = await executeTokenAuthMutation(deps, address, step)
        if (result !== undefined) {
          executed.push(result)
          if (result.status !== UserActionStatus.Accepted) {
            break
          }
        }
      } else {
        signed.push(await signStandardWasmAction(deps, address, step))
      }
    }
  } catch (error) {
    rethrowWithKnownResults(executed, error)
  }
  return { signed, executed }
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
  const clientOrderIndex = clientOrderIndexOf(step.wasmSignParams)
  return {
    action: step.action,
    wasmSignParams: step.wasmSignParams,
    signedTx,
    ...(clientOrderIndex === undefined ? {} : { clientOrderIndex }),
  }
}

/**
 * Project the signed order's `client_order_index` so the caller can resolve it
 * through `getOrder` before the venue assigns an `order_index`. Only the
 * order-placing actions carry one, and the value is read back off the params
 * that were signed rather than generated a second time.
 */
function clientOrderIndexOf(
  wasmSignParams: Record<string, unknown>
): string | undefined {
  const value = wasmSignParams.client_order_index
  return typeof value === 'number' && Number.isInteger(value)
    ? String(value)
    : undefined
}

/**
 * REGISTER_API_KEY flow:
 *   1. Look up the user's Lighter accountIndex (Lighter REST).
 *   2. Create a new Lighter API keypair and its ChangePubKey L1 message.
 *   3. Have the user's L1 Ethereum wallet sign the message.
 *   4. Sign the ChangePubKey with that L1 signature.
 *   5. Persist the keypair and return the signed blob.
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
  const apiKeyIndex = params.api_key_index
  if (typeof apiKeyIndex !== 'number') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'REGISTER_API_KEY wasmSignParams is missing `api_key_index`.'
    )
  }
  const nonce = params.nonce
  if (typeof nonce !== 'number') {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'REGISTER_API_KEY wasmSignParams is missing `nonce`.'
    )
  }
  const skipNonce = params.skip_nonce === 1

  const accountIndex = await deps.resolveAccountIndex(address)

  const keypair = await deps.signer.createApiKey(
    { accountIndex, apiKeyIndex },
    nonce,
    skipNonce
  )

  const l1Signature = await walletSigner.signMessage({
    account: walletSigner.account,
    message: keypair.messageToSign,
  })

  const signedTx = await deps.signer.signChangePubKey(
    {
      apiKeyPrivateKey: keypair.privateKey,
      apiKeyIndex,
      accountIndex,
    },
    nonce,
    skipNonce,
    l1Signature
  )

  // The referral marker belongs to the L1 address, not to the key slot.
  const previousKey = await deps.keyStore.get(address)
  await deps.keyStore.set(address, {
    accountIndex,
    apiKeyIndex,
    apiKeyPrivateKey: keypair.privateKey,
    apiKeyPublicKey: keypair.publicKey,
    appliedReferralCode: previousKey?.appliedReferralCode,
  })

  return {
    action: step.action,
    wasmSignParams: {
      ...step.wasmSignParams,
      new_public_key: keypair.publicKey,
    },
    signedTx,
  }
}

/**
 * Shared L1-countersign flow for the Lighter WASM_BLOB actions that require
 * the end-user's Ethereum wallet:
 *   1. Guard that the caller supplied `ctx.userWallet`.
 *   2. Load the user's stored API key (no keypair generation).
 *   3. Get the EIP-191 L1 message for the action.
 *   4. Have the user's L1 Ethereum wallet sign that message.
 *   5. Sign the action with that L1 signature.
 *
 * `actionLabel` names the caller's action in the missing-wallet error
 * message. Each caller keeps its own doc comment stating why its flow needs the
 * L1 signature.
 */
async function signL1CountersignedWasmAction(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep,
  ctx: SignActionsContext | undefined,
  action: LighterL1CountersignedAction,
  actionLabel: 'APPROVE_INTEGRATOR' | 'TRANSFER'
): Promise<WasmBlobSignedActionStep> {
  const walletSigner = ctx?.userWallet
  if (!walletSigner) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `${actionLabel} requires the end-user wallet — pass \`userWallet\` to ` +
        'createPerpsClient or call setUserWallet(walletClient).'
    )
  }

  const apiKey = await requireApiKey(deps, address)
  const context = {
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  }
  const messageToSign = await deps.signer.getL1Message(
    action,
    step.wasmSignParams,
    context
  )

  const l1Signature = await walletSigner.signMessage({
    account: walletSigner.account,
    message: messageToSign,
  })

  const signedTx = await deps.signer.signL1Countersigned(
    action,
    step.wasmSignParams,
    context,
    l1Signature
  )

  return {
    action: step.action,
    wasmSignParams: step.wasmSignParams,
    signedTx,
  }
}

/**
 * APPROVE_INTEGRATOR flow. Requires the end-user's wallet in
 * `ctx.userWallet`: Lighter rejects the tx without the user's `L1Sig` when
 * the integrator account belongs to a different L1 address with non-zero fee
 * caps.
 */
async function signApproveIntegrator(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep,
  ctx: SignActionsContext | undefined
): Promise<WasmBlobSignedActionStep> {
  return await signL1CountersignedWasmAction(
    deps,
    address,
    step,
    ctx,
    ActionType.APPROVE_INTEGRATOR,
    'APPROVE_INTEGRATOR'
  )
}

/**
 * TRANSFER flow. Requires the end-user's wallet in `ctx.userWallet`: the
 * destination account and the amount are only bound to the account owner by
 * the user's `L1Sig`, so the stored API key alone must not authorize the
 * move.
 */
async function signTransfer(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep,
  ctx: SignActionsContext | undefined
): Promise<WasmBlobSignedActionStep> {
  return await signL1CountersignedWasmAction(
    deps,
    address,
    step,
    ctx,
    ActionType.TRANSFER,
    'TRANSFER'
  )
}

/**
 * Execute a token-auth mutation without sending its auth token to the backend.
 * An existing referral settles without a result. Server errors and malformed
 * verdicts are indeterminate: the mutation may already have been applied.
 */
async function executeTokenAuthMutation(
  deps: LighterSignActionsDeps,
  address: Address,
  step: WasmBlobActionStep
): Promise<ActionResult | undefined> {
  const apiKey = await requireApiKey(deps, address)
  const authToken = await deps.signer.createAuthToken({
    apiKeyPrivateKey: apiKey.apiKeyPrivateKey,
    apiKeyIndex: apiKey.apiKeyIndex,
    accountIndex: apiKey.accountIndex,
  })

  let appliedReferralCode: string | undefined
  if (step.wasmSignParams.kind === 'referralUse') {
    const { referral_code } = step.wasmSignParams as { referral_code?: string }
    appliedReferralCode = referral_code
    if (typeof referral_code === 'string') {
      const venueCode = await readAppliedReferralCode(deps, address, authToken)
      if (venueCode.length > 0) {
        await deps.keyStore.markReferralApplied(address, venueCode)
        return undefined
      }
    }
  }

  const { path, params } = buildTokenAuthMutationRequest(step)
  let answer: {
    status: number
    data: { code?: unknown; message?: string } | undefined
  }
  try {
    answer = await deps.apiClient.postForm(path, authToken, params)
  } catch (error) {
    if (
      error instanceof PerpsError &&
      error.code === PerpsErrorCode.RateLimitExceeded
    ) {
      throw error
    }
    return {
      action: step.action,
      status: UserActionStatus.Indeterminate,
      error: unconfirmedIndeterminateErrorText(step.action, deps.providerKey),
      errorCode:
        error instanceof PerpsError ? error.code : PerpsErrorCode.ServerError,
    }
  }

  const { status, data } = answer
  const code = data?.code
  if (status >= 500 || typeof code !== 'number' || !Number.isInteger(code)) {
    return {
      action: step.action,
      status: UserActionStatus.Indeterminate,
      error: unconfirmedIndeterminateErrorText(step.action, deps.providerKey),
      errorCode: PerpsErrorCode.ServerError,
    }
  }
  const referralAlreadyApplied =
    step.wasmSignParams.kind === 'referralUse' &&
    code === LIGHTER_REFERRAL_ALREADY_USED_CODE
  if (referralAlreadyApplied) {
    if (appliedReferralCode !== undefined) {
      await deps.keyStore.markReferralApplied(address, appliedReferralCode)
    }
    return undefined
  }
  if (status < 200 || status >= 300 || code !== LIGHTER_MUTATION_SUCCESS_CODE) {
    return {
      action: step.action,
      status: UserActionStatus.Failed,
      error: rejectedFailedErrorText(
        step.action,
        deps.providerKey,
        code,
        status,
        data?.message
      ),
      errorCode:
        lighterErrorCodeFromBody(code) ?? PerpsErrorCode.ExchangeRejected,
    }
  }

  const accepted: ActionResult = {
    action: step.action,
    status: UserActionStatus.Accepted,
  }
  if (appliedReferralCode !== undefined) {
    try {
      await deps.keyStore.markReferralApplied(address, appliedReferralCode)
    } catch (error) {
      rethrowWithKnownResults([accepted], error)
    }
  }
  return accepted
}

/**
 * The referral code Lighter reports for the account, or the empty string when
 * the account carries none. A failed read also yields the empty string, so the
 * `/referral/use` POST still runs and Lighter decides.
 */
async function readAppliedReferralCode(
  deps: LighterSignActionsDeps,
  address: Address,
  authToken: string
): Promise<string> {
  try {
    return await fetchAppliedReferralCode(deps.apiClient, address, authToken)
  } catch (err) {
    console.debug(
      `[lighter] could not read the referral code applied to ${address} from ` +
        '/api/v1/referral/userReferrals; sending the referral/use request.',
      err
    )
    return ''
  }
}

/**
 * Map a token-authenticated mutation step to its Lighter endpoint and form
 * body. The fields come from `wasmSignParams`; the auth token travels in the
 * `Authorization` header, not the body.
 */
function buildTokenAuthMutationRequest(step: WasmBlobActionStep): {
  path: string
  params: ApiParams
} {
  const kind = step.wasmSignParams.kind
  if (kind === 'changeAccountTier') {
    const { account_index, new_tier } = step.wasmSignParams as {
      account_index?: number
      new_tier?: string
    }
    if (account_index == null || new_tier == null) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Lighter ACCOUNT_TYPE wasmSignParams missing account_index or new_tier'
      )
    }
    return {
      path: '/api/v1/changeAccountTier',
      params: { account_index, new_tier },
    }
  }
  if (kind === 'referralUse') {
    const { l1_address, referral_code, x } = step.wasmSignParams as {
      l1_address?: string
      referral_code?: string
      x?: string
    }
    if (l1_address == null || referral_code == null || x == null) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        'Lighter SET_REFERRAL wasmSignParams missing l1_address, referral_code, or x'
      )
    }
    return {
      path: '/api/v1/referral/use',
      params: { l1_address, referral_code, x },
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
 * step (e.g. approve) having mined. Each step's `txParams` carries chainId,
 * target, function name, args, and a human-readable abi from the backend.
 *
 * When every leg confirms, the legs are `signed` for `/executeAction`. A leg
 * that reverts, or whose receipt does not arrive, aborts the remaining legs:
 * the batch then returns no `signed` step and reports each confirmed leg as
 * `Accepted`, then the reverted leg as a `Failed` result or the
 * unconfirmed leg as `Indeterminate`. A leg that throws before its broadcast
 * throws a `PerpsExecutionError` when an earlier leg confirmed.
 *
 * Before broadcasting a leg the SDK switches the wallet to the leg's
 * `txParams.chainId` via `ctx.switchToChain`, re-reading the returned client so
 * the broadcast lands on the right chain even when legs target different chains.
 * When no switch capability is supplied (local/private-key signer, or no
 * `switchChain` hook configured) a leg whose target chain differs from the
 * wallet's active chain throws before broadcasting, so a token approve/deposit
 * can never land on an unintended chain.
 * @internal
 */
export async function signEvmTxActions(
  providerKey: string,
  steps: EvmTxActionStep[],
  ctx: SignActionsContext | undefined
): Promise<SignActionsResult> {
  const walletSigner = ctx?.userWallet
  if (!walletSigner) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'EVM_TX signing requires the end-user wallet. Pass `userWallet` to ' +
        'createPerpsClient or call setUserWallet(walletClient).'
    )
  }

  const switchToChain = ctx?.switchToChain
  const onProgress = ctx?.onProgress
  const signed: EvmTxSignedActionStep[] = []
  const confirmed = (): ActionResult[] =>
    signed.map((leg) => ({
      action: leg.action,
      status: UserActionStatus.Accepted,
      txHash: leg.txHash,
    }))
  let legSigner = walletSigner
  for (const [index, step] of steps.entries()) {
    const params = step.txParams

    let txHash: Hex
    try {
      if (legSigner.chain?.id !== params.chainId && switchToChain) {
        legSigner = await switchToChain(params.chainId)
      }
      if (legSigner.chain?.id !== params.chainId) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          `EVM_TX leg '${step.action}' targets chain ${params.chainId}, but the ` +
            `connected wallet is on chain ${legSigner.chain?.id ?? 'unknown'} and ` +
            'no chain switch was performed. Configure a switchChain hook via ' +
            `setSwitchChain, or connect the wallet to chain ${params.chainId} ` +
            'before signing.'
        )
      }

      txHash = await legSigner.writeContract({
        address: params.to,
        abi: parseAbi(params.abi),
        functionName: params.functionName,
        args: params.args,
        chain: legSigner.chain,
        account: legSigner.account,
      })
    } catch (error) {
      rethrowWithKnownResults(confirmed(), error)
    }
    try {
      onProgress?.({
        index,
        total: steps.length,
        action: step.action,
        functionName: params.functionName,
        chainId: params.chainId,
        status: 'submitted',
        txHash,
      })
    } catch (error) {
      rethrowWithKnownResults(
        [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Submitted,
            txHash,
          },
        ],
        error
      )
    }

    let receipt: Awaited<ReturnType<typeof waitForTransactionReceipt>>
    try {
      receipt = await waitForTransactionReceipt(legSigner, {
        hash: txHash,
      })
    } catch (error) {
      return {
        signed: [],
        executed: [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Indeterminate,
            txHash,
            error: unconfirmedIndeterminateErrorText(step.action, providerKey),
            errorCode:
              error instanceof WaitForTransactionReceiptTimeoutError
                ? PerpsErrorCode.TimeoutError
                : PerpsErrorCode.ServerError,
          },
        ],
      }
    }
    if (receipt.status === 'reverted') {
      return {
        signed: [],
        executed: [
          ...confirmed(),
          {
            action: step.action,
            status: UserActionStatus.Failed,
            txHash,
            error: revertedFailedErrorText(step.action, txHash),
            errorCode: PerpsErrorCode.SDKError,
          },
        ],
      }
    }
    signed.push({
      action: step.action,
      txParams: step.txParams,
      txHash,
    })
    try {
      onProgress?.({
        index,
        total: steps.length,
        action: step.action,
        functionName: params.functionName,
        chainId: params.chainId,
        status: 'confirmed',
        txHash,
      })
    } catch (error) {
      rethrowWithKnownResults(confirmed(), error)
    }
  }

  return { signed, executed: [] }
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
): Promise<SignActionsResult> {
  switch (method) {
    case SigningMethod.WASM_BLOB:
      return signWasmBlobActions(
        deps,
        address,
        steps as WasmBlobActionStep[],
        ctx
      )
    case SigningMethod.EVM_TX:
      return signEvmTxActions(deps.providerKey, steps as EvmTxActionStep[], ctx)
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
