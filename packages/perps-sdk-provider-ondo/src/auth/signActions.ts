import { PerpsError, type SignActionsContext } from '@lifi/perps-sdk'
import type {
  ActionResult,
  ActionStep,
  RestCallSignedActionStep,
  SignedActionStep,
  SiweActionStep,
} from '@lifi/perps-types'
import { PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  type OndoApiClient,
  type OndoHttpMethod,
  OndoSessionExpiredError,
} from '../utils/apiClient.js'
import { completeSiweLogin } from './completeSiweLogin.js'
import type { OndoTokenStore } from './OndoTokenStore.js'

/** @internal */
export interface OndoSignActionsDeps {
  client: OndoApiClient
  tokenStore: OndoTokenStore
}

const isSiweStep = (step: ActionStep): step is SiweActionStep => 'siwe' in step

const hasRequest = (
  step: ActionStep
): step is Extract<ActionStep, { request: unknown }> => 'request' in step

/**
 * Ondo's `signActions` arms.
 *
 * `SIWE` signs the backend-built ERC-4361 challenge with the user's wallet
 * and completes the login directly against Ondo — the returned session JWT is
 * persisted in the token store and never transits the LI.FI backend.
 *
 * `AUTH_TOKEN` attaches the stored session JWT as an `Authorization: Bearer`
 * header on each REST-call step; an absent or expired token throws
 * {@link OndoSessionExpiredError} so callers re-run the SIWE login.
 *
 * @public
 */
export async function ondoSignActions(
  deps: OndoSignActionsDeps,
  method: SigningMethod,
  steps: ActionStep[],
  address: Address,
  ctx?: SignActionsContext
): Promise<SignedActionStep[]> {
  switch (method) {
    case SigningMethod.SIWE: {
      const userWallet = ctx?.userWallet
      if (userWallet === undefined) {
        throw new PerpsError(
          PerpsErrorCode.SDKError,
          'Ondo SIWE login requires the user wallet. Pass `userWallet` when ' +
            'creating the perps client.'
        )
      }
      const signed: SignedActionStep[] = []
      for (const step of steps) {
        if (!isSiweStep(step)) {
          throw new PerpsError(
            PerpsErrorCode.SDKError,
            `Ondo received a non-SIWE step ('${step.action}') under the SIWE signing method.`
          )
        }
        const { token, signature } = await completeSiweLogin(
          deps.client,
          userWallet,
          { id: step.siwe.challengeId, message: step.siwe.message }
        )
        await deps.tokenStore.set(address, token)
        signed.push({ action: step.action, siwe: step.siwe, signature })
      }
      return signed
    }

    case SigningMethod.AUTH_TOKEN: {
      const token = await deps.tokenStore.get(address)
      if (token === null) {
        throw new OndoSessionExpiredError(
          `No valid Ondo session token stored for ${address}. Run the SIWE login first.`
        )
      }
      return steps.map((step): RestCallSignedActionStep => {
        if (!hasRequest(step)) {
          throw new PerpsError(
            PerpsErrorCode.SDKError,
            `Ondo received a non-REST step ('${step.action}') under the AUTH_TOKEN signing method.`
          )
        }
        return {
          action: step.action,
          request: step.request,
          headers: { Authorization: `Bearer ${token.token}` },
        }
      })
    }

    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Ondo does not sign via '${method}'. Supported methods: siwe, authToken.`
      )
  }
}

/**
 * Execute credential-bearing REST-call steps directly against Ondo,
 * sequentially — later steps in a batch may depend on earlier ones (e.g.
 * leverage update before order placement), so after the first failure the
 * remainder is skipped rather than executed out of order.
 *
 * @public
 */
export async function executeOndoRestCallActions(
  client: OndoApiClient,
  steps: RestCallSignedActionStep[]
): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  let failed = false
  for (const step of steps) {
    if (failed) {
      results.push({
        action: step.action,
        success: false,
        error: 'Skipped: a preceding step in the batch failed.',
      })
      continue
    }
    try {
      const result = await client.send<unknown>(
        step.request.method as OndoHttpMethod,
        step.request.path,
        { body: step.request.body, headers: step.headers }
      )
      const orderId =
        typeof result === 'object' &&
        result !== null &&
        typeof (result as { orderId?: unknown }).orderId === 'string'
          ? (result as { orderId: string }).orderId
          : undefined
      results.push({
        action: step.action,
        success: true,
        ...(orderId === undefined ? {} : { orderId }),
      })
    } catch (err) {
      failed = true
      results.push({
        action: step.action,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
