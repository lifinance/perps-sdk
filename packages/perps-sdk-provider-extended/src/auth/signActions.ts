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
  type Hex,
  PerpsErrorCode,
  SigningMethod,
  type StarkActionStep,
  type StarkMessage,
  UserActionStatus,
} from '@lifi/perps-types'
import { signStarkHash } from '../signing/starkKey.js'
import {
  calculateStarkOrderHash,
  calculateStarkTransferHash,
  calculateStarkWithdrawalHash,
  type StarkDomain,
} from '../signing/starkMessageHash.js'
import { ExtendedApiError } from '../utils/apiClient.js'
import type { ExtendedCredentials } from './ExtendedCredentialStore.js'
import {
  type ExtendedRegistrationDeps,
  registerExtendedAccount,
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

function writeAtPath(
  body: Record<string, unknown>,
  path: string[],
  value: unknown
): void {
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

async function executeStarkStep(
  deps: ExtendedSignActionsDeps,
  step: StarkActionStep,
  credentials: ExtendedCredentials
): Promise<ActionResult> {
  const body = await buildSignedBody(step, deps.starkDomain, credentials)
  let data: unknown
  try {
    const { method, path } = step.stark.request
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
        action: step.action,
        status: UserActionStatus.Failed,
        error: error.message,
        errorCode: error.code,
      }
    }
    return {
      action: step.action,
      status: UserActionStatus.Indeterminate,
      error: `${step.action} was sent to Extended, but Extended did not confirm it. ${CHECK_ACCOUNT_BEFORE_RETRY_TEXT}`,
      errorCode:
        error instanceof PerpsError ? error.code : PerpsErrorCode.ServerError,
    }
  }
  const orderId = (data as { id?: unknown } | undefined)?.id
  return {
    action: step.action,
    // Extended acknowledges a request before its matching engine applies it.
    status: UserActionStatus.Submitted,
    ...(orderId === undefined ? {} : { orderId: String(orderId) }),
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

/**
 * Extended's `signActions` arms. Every arm runs in the client and returns no
 * signed step, so `executeAction` is skipped and neither key leaves the client.
 *
 * - `SESSION` with `REGISTER_API_KEY`: the wallet signs the Stark key seed,
 *   the account registration, and the API-key request. The credentials go to
 *   the credential store.
 * - `STARK`: sign each message with the stored Stark key, write the
 *   signatures into the body, and send the request with the stored API key.
 *   A message that spends from another position is refused before signing.
 *   The arm stops at the first result that is not `Submitted`.
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
  const executed: ActionResult[] = []
  switch (method) {
    case SigningMethod.SESSION: {
      try {
        for (const step of steps) {
          if (step.action !== ActionType.REGISTER_API_KEY) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Extended has no session-step executor for action '${step.action}'.`
            )
          }
          await registerExtendedAccount(deps, requireUserWallet(ctx), address)
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
      const credentials = await deps.credentialStore.get(address)
      if (credentials === null) {
        throw new PerpsError(
          PerpsErrorCode.SetupRequired,
          'Extended credentials are missing on this device. Run the Extended setup again.'
        )
      }
      try {
        for (const step of steps) {
          if (!isStarkStep(step)) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Extended received a non-Stark step ('${step.action}') under the stark signing method.`
            )
          }
          const result = await executeStarkStep(deps, step, credentials)
          executed.push(result)
          if (result.status !== UserActionStatus.Submitted) {
            break
          }
        }
      } catch (error) {
        rethrowWithKnownResults(executed, error)
      }
      return { signed: [], executed }
    }

    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Extended does not sign via '${method}'. Supported methods: session, stark.`
      )
  }
}
