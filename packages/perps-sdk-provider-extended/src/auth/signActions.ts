import {
  PerpsError,
  rethrowWithKnownResults,
  type SignActionsContext,
  type SignActionsResult,
} from '@lifi/perps-sdk'
import {
  type ActionResult,
  type ActionStep,
  ActionType,
  type Address,
  CHECK_ACCOUNT_BEFORE_RETRY_TEXT,
  type EvmTxActionStep,
  type Hex,
  PerpsErrorCode,
  SigningMethod,
  type StarkActionStep,
  type StarkMessage,
  type StarkSignedActionStep,
  UserActionStatus,
} from '@lifi/perps-types'
import { parseUnits } from 'viem'
import { commitBridgeQuote, readBridgeRecipient } from '../bridge/rhino.js'
import {
  EXTENDED_SETTLEMENT_DECIMALS,
  EXTENDED_VENUE_BRIDGE_CHAIN,
} from '../constants.js'
import { toStarkHex } from '../signing/starkFelt.js'
import { signStarkHash } from '../signing/starkKey.js'
import {
  calculateStarkOrderHash,
  calculateStarkTransferHash,
  calculateStarkWithdrawalHash,
  type StarkDomain,
} from '../signing/starkMessageHash.js'
import { ExtendedApiError } from '../utils/apiClient.js'
import { executeDeposit } from './deposit.js'
import type { ExtendedCredentials } from './ExtendedCredentialStore.js'
import {
  type ExtendedRegistrationDeps,
  registerExtendedApiKey,
  signOnboardingRequest,
} from './registerAccount.js'

/** @internal */
export interface ExtendedSignActionsDeps extends ExtendedRegistrationDeps {
  starkDomain: StarkDomain
}

const isStarkStep = (step: ActionStep): step is StarkActionStep =>
  'stark' in step

/** The position that each message spends from must be the account's own. */
const spendingPositionOf = (message: StarkMessage): string => {
  switch (message.type) {
    case 'order':
      return message.fields.positionId
    case 'transfer':
      return message.fields.senderPositionId
    case 'withdrawal':
      return message.fields.positionId
  }
}

async function calculateMessageHash(
  message: StarkMessage,
  domain: StarkDomain,
  credentials: ExtendedCredentials
): Promise<Hex> {
  if (BigInt(spendingPositionOf(message)) !== BigInt(credentials.positionId)) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended ${message.type} message spends from position ${spendingPositionOf(message)}, not from the account position ${credentials.positionId}.`
    )
  }
  switch (message.type) {
    case 'order':
      return calculateStarkOrderHash(
        message.fields,
        domain,
        credentials.starkPublicKey
      )
    case 'transfer':
      return calculateStarkTransferHash(
        message.fields,
        domain,
        credentials.starkPublicKey
      )
    case 'withdrawal':
      return calculateStarkWithdrawalHash(
        message.fields,
        domain,
        credentials.starkPublicKey
      )
  }
}

const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function writeAtPath(
  body: Record<string, unknown>,
  path: string[],
  value: unknown
): void {
  if (path.some((key) => PROTOTYPE_KEYS.has(key))) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended signature path '${path.join('.')}' names a prototype key.`
    )
  }
  let target = body
  for (const key of path.slice(0, -1)) {
    const next = target[key] ?? {}
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Extended signature path '${path.join('.')}' crosses a value that is not an object.`
      )
    }
    target[key] = next
    target = next as Record<string, unknown>
  }
  const last = path.at(-1)
  if (last === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended signature path is empty.'
    )
  }
  target[last] = value
}

/** Sign the step's messages into a copy of its body. @internal */
export async function buildSignedBody(
  step: StarkActionStep,
  domain: StarkDomain,
  credentials: ExtendedCredentials
): Promise<Record<string, unknown> | undefined> {
  const { request, messages } = step.stark
  if (messages.length === 0) {
    return request.body
  }
  // The stored key signs without a wallet prompt, so the backend cannot ask it
  // to move funds to another position or to a withdrawal recipient it chose.
  const fundsMove = messages.find(
    ({ type }) =>
      type === 'transfer' ||
      (type === 'withdrawal' && step.action !== ActionType.WITHDRAWAL)
  )
  if (fundsMove !== undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended does not sign a ${fundsMove.type} message for a '${step.action}' step.`
    )
  }
  if (request.body === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended '${step.action}' step has Stark messages but no request body.`
    )
  }
  const body = structuredClone(request.body)
  for (const message of messages) {
    const hash = await calculateMessageHash(message, domain, credentials)
    writeAtPath(
      body,
      message.signaturePath,
      await signStarkHash(hash, credentials.starkPrivateKey)
    )
  }
  return body
}

const isEvmTxStep = (step: ActionStep): step is EvmTxActionStep =>
  'txParams' in step

/**
 * Complete a withdrawal step with the parts that need the API key: the
 * account's bridge address as the recipient, in the signed message and in the
 * settlement, and a committed Rhino.fi quote for the destination chain. The
 * SDK writes the recipient itself, so no step can redirect the funds.
 */
async function prepareWithdrawal(
  deps: ExtendedSignActionsDeps,
  step: StarkActionStep,
  credentials: ExtendedCredentials
): Promise<StarkActionStep> {
  const body = step.stark.request.body
  const chainOut = body?.chainId
  const amount = body?.amount
  if (
    body === undefined ||
    typeof chainOut !== 'string' ||
    typeof amount !== 'string' ||
    !/^\d+(\.\d+)?$/.test(amount)
  ) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended withdrawal step has no destination chain or amount.'
    )
  }
  const [message, ...otherMessages] = step.stark.messages
  const settlement = body.settlement
  if (
    message === undefined ||
    message.type !== 'withdrawal' ||
    otherMessages.length > 0 ||
    typeof settlement !== 'object' ||
    settlement === null
  ) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended withdrawal step must carry one withdrawal message and a settlement.'
    )
  }
  const settlementAmount =
    'amount' in settlement ? settlement.amount : undefined
  const signedAmount = BigInt(message.fields.amount)
  if (
    signedAmount !== parseUnits(amount, EXTENDED_SETTLEMENT_DECIMALS) ||
    (typeof settlementAmount !== 'string' &&
      typeof settlementAmount !== 'number') ||
    BigInt(settlementAmount) !== signedAmount
  ) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      `Extended withdrawal amounts do not agree: ${amount} in the request, ${message.fields.amount} in the signed message, ${String(settlementAmount)} in the settlement.`
    )
  }
  const [bridgeAddress, quoteId] = await Promise.all([
    readBridgeRecipient(deps.client, credentials.apiKey),
    commitBridgeQuote(deps.client, credentials.apiKey, {
      chainIn: EXTENDED_VENUE_BRIDGE_CHAIN,
      chainOut,
      amount,
    }),
  ])
  // Written as Extended's own SDK writes it: the integer in hex.
  const recipient = toStarkHex(bridgeAddress)
  return {
    action: step.action,
    stark: {
      request: {
        ...step.stark.request,
        body: { ...body, quoteId, settlement: { ...settlement, recipient } },
      },
      messages: [{ ...message, fields: { ...message.fields, recipient } }],
    },
  }
}

/**
 * Sign the step and send it with the API key. A withdrawal first gets its
 * recipient and a committed bridge quote. A success gives the signed request
 * for `executeAction`, where the backend records it; a refusal or an
 * unconfirmed send gives the result, which stays in the client.
 */
async function executeStarkStep(
  deps: ExtendedSignActionsDeps,
  unprepared: StarkActionStep,
  credentials: ExtendedCredentials
): Promise<{ sent: StarkSignedActionStep } | { result: ActionResult }> {
  const step =
    unprepared.action === ActionType.WITHDRAWAL
      ? await prepareWithdrawal(deps, unprepared, credentials)
      : unprepared
  const body = await buildSignedBody(step, deps.starkDomain, credentials)
  const { method, path } = step.stark.request
  let data: unknown
  try {
    data = await deps.client.send(method, path, {
      body,
      apiKey: credentials.apiKey,
    })
  } catch (error) {
    if (
      error instanceof ExtendedApiError &&
      error.code !== PerpsErrorCode.ThirdPartyError
    ) {
      return {
        result: {
          action: step.action,
          status: UserActionStatus.Failed,
          error: error.message,
          errorCode: error.code,
        },
      }
    }
    return {
      result: {
        action: step.action,
        status: UserActionStatus.Indeterminate,
        error: `${step.action} was sent to Extended, but Extended did not confirm it. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`,
        errorCode:
          error instanceof PerpsError ? error.code : PerpsErrorCode.ServerError,
      },
    }
  }
  const orderId = (data as { id?: unknown } | undefined)?.id
  return {
    sent: {
      action: step.action,
      stark: {
        request: { ...step.stark.request, body },
        messages: step.stark.messages,
      },
      clientSent: orderId === undefined ? {} : { orderId: String(orderId) },
    },
  }
}

const requireUserWallet = (ctx: SignActionsContext | undefined) => {
  if (ctx?.userWallet === undefined) {
    throw new PerpsError(
      PerpsErrorCode.SDKError,
      'Extended account setup requires the user wallet. Pass `userWallet` when creating the perps client.'
    )
  }
  return ctx.userWallet
}

/** A sent request that is still to be reported, as a known result. */
const sentResult = (sent: StarkSignedActionStep): ActionResult => ({
  action: sent.action,
  status: UserActionStatus.Submitted,
  ...(sent.clientSent?.orderId === undefined
    ? {}
    : { orderId: sent.clientSent.orderId }),
})

/**
 * Extended's `signActions` arms. Neither the Stark key nor the API key leaves
 * the client.
 *
 * - `SESSION` with `REGISTER_API_KEY`: create an API key for the account and
 *   store the credentials. The wallet signs the API-key request, and the Stark
 *   key seed when this session has not signed it yet.
 * - `STARK` with `CREATE_ACCOUNT`: sign the backend-built onboarding request
 *   and return it unsent; the backend sends it to Extended.
 * - `STARK` with any other action: sign each message with the stored Stark
 *   key, write the signatures into the body, and send the request with the
 *   stored API key. Each success is a signed step with `clientSent` for
 *   `executeAction`, where the backend records it. A message that spends from
 *   another position is refused before signing. A withdrawal first gets its
 *   recipient and a committed bridge quote. The arm stops at the first
 *   refused or unconfirmed send, which stays a local result.
 * - `EVM_TX` with `DEPOSIT`: approve and deposit USDC through the Rhino.fi
 *   bridge from the user's wallet, with a quote committed right before the
 *   deposit leg.
 *
 * @public
 */
export async function extendedSignActions(
  deps: ExtendedSignActionsDeps,
  method: SigningMethod,
  steps: ActionStep[],
  address: Address,
  ctx?: SignActionsContext
): Promise<SignActionsResult> {
  switch (method) {
    case SigningMethod.SESSION: {
      const executed: ActionResult[] = []
      try {
        for (const step of steps) {
          if (step.action !== ActionType.REGISTER_API_KEY) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Extended has no session-step executor for action '${step.action}'.`
            )
          }
          await registerExtendedApiKey(deps, requireUserWallet(ctx), address)
          executed.push({
            action: step.action,
            status: UserActionStatus.Accepted,
          })
        }
      } catch (error) {
        rethrowWithKnownResults(executed, error)
      }
      return { signed: [], executed }
    }

    case SigningMethod.STARK: {
      const signed: StarkSignedActionStep[] = []
      const executed: ActionResult[] = []
      try {
        for (const step of steps) {
          if (!isStarkStep(step)) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Extended received a non-Stark step ('${step.action}') under the stark signing method.`
            )
          }
          if (step.action === ActionType.CREATE_ACCOUNT) {
            signed.push(
              await signOnboardingRequest(
                deps,
                requireUserWallet(ctx),
                address,
                step
              )
            )
            continue
          }
          const credentials = await deps.credentialStore.get(address)
          if (credentials === null) {
            throw new PerpsError(
              PerpsErrorCode.SetupRequired,
              'Extended credentials are missing on this device. Run the Extended setup again.'
            )
          }
          const outcome = await executeStarkStep(deps, step, credentials)
          if ('result' in outcome) {
            executed.push(outcome.result)
            break
          }
          signed.push(outcome.sent)
        }
      } catch (error) {
        rethrowWithKnownResults(
          signed
            .filter((step) => step.clientSent !== undefined)
            .map(sentResult),
          error
        )
      }
      return { signed, executed }
    }

    case SigningMethod.EVM_TX: {
      const credentials = await deps.credentialStore.get(address)
      if (credentials === null) {
        throw new PerpsError(
          PerpsErrorCode.SetupRequired,
          'Extended credentials are missing on this device. Run the Extended setup again.'
        )
      }
      const legs = steps.filter(isEvmTxStep)
      if (
        legs.length !== steps.length ||
        legs.some((leg) => leg.action !== ActionType.DEPOSIT)
      ) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'Extended runs only deposit legs under the evmTx signing method.'
        )
      }
      return executeDeposit(deps.client, credentials.apiKey, legs, ctx)
    }

    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Extended does not sign via '${method}'. Supported methods: session, stark, evmTx.`
      )
  }
}
