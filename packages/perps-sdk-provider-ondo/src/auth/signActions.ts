import { PerpsError, type SignActionsContext } from '@lifi/perps-sdk'
import type {
  ActionStep,
  HmacSignedActionStep,
  SessionActionStep,
  SignedActionStep,
  SiweActionStep,
} from '@lifi/perps-types'
import { ActionType, PerpsErrorCode, SigningMethod } from '@lifi/perps-types'
import type { Address } from 'viem'
import {
  ONDO_API_KEY_NAME,
  ONDO_API_KEY_SCOPES,
  ONDO_PRIVACY_VERSION,
  ONDO_TERMS_VERSION,
} from '../constants.js'
import type { OndoApiKey } from '../types/auth.js'
import {
  type OndoApiClient,
  OndoSessionExpiredError,
} from '../utils/apiClient.js'
import { completeSiweLogin } from './completeSiweLogin.js'
import { hmacSignRequest } from './hmac.js'
import type { OndoApiKeyStore } from './OndoApiKeyStore.js'
import type { OndoTokenStore } from './OndoTokenStore.js'

/** @internal */
export interface OndoSignActionsDeps {
  client: OndoApiClient
  tokenStore: OndoTokenStore
  apiKeyStore: OndoApiKeyStore
}

const isSiweStep = (step: ActionStep): step is SiweActionStep => 'siwe' in step

const isSessionStep = (step: ActionStep): step is SessionActionStep =>
  'session' in step

const hasRequest = (
  step: ActionStep
): step is Extract<ActionStep, { request: unknown }> => 'request' in step

/**
 * Fetch the stored trading API key, minting one on first use. Minting is
 * JWT-authorized (`POST /v1/api_keys`); the returned record — including the
 * `apiSecret` the venue reveals only once — is stored immediately. An absent
 * session throws {@link OndoSessionExpiredError} so callers re-run SIWE login.
 */
async function ensureApiKey(
  deps: OndoSignActionsDeps,
  address: Address
): Promise<OndoApiKey> {
  const existing = await deps.apiKeyStore.get(address)
  if (existing !== null) {
    return existing
  }
  const token = await deps.tokenStore.get(address)
  if (token === null) {
    throw new OndoSessionExpiredError(
      `No valid Ondo session token stored for ${address}. Run the SIWE login first.`
    )
  }
  const apiKey = await deps.client.post<OndoApiKey>(
    '/v1/api_keys',
    { name: ONDO_API_KEY_NAME, scopes: ONDO_API_KEY_SCOPES },
    { authToken: token.token }
  )
  await deps.apiKeyStore.set(address, apiKey)
  return apiKey
}

/**
 * Ondo's `signActions` arms.
 *
 * `SIWE` signs the backend-built ERC-4361 challenge with the user's wallet and
 * completes the login directly against Ondo — the returned session JWT is
 * persisted in the token store and never transits the LI.FI backend.
 *
 * `SESSION` executes client-only setup steps directly against the venue with
 * the stored session token, keyed on the step's action — the marker steps
 * carry no request material by design. Returns no signed steps, so
 * `executeAction` is skipped.
 *
 * `HMAC` computes a per-request HMAC-SHA256 signature over each request step
 * from the client-held API key (minting one on first use), attaching the
 * `hmac` material. The signed step rides the normal `executeAction` path; the
 * API secret itself never leaves the client.
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

    case SigningMethod.HMAC: {
      const apiKey = await ensureApiKey(deps, address)
      return Promise.all(
        steps.map(async (step): Promise<HmacSignedActionStep> => {
          if (!hasRequest(step)) {
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Ondo received a step without a request ('${step.action}') under the hmac signing method.`
            )
          }
          // Stamped immediately before executeAction; Ondo enforces a 30s window.
          const timestampMs = Date.now()
          const signature = await hmacSignRequest(apiKey.apiSecret, {
            timestampMs,
            method: step.request.method,
            pathWithQuery: step.request.path,
            body: step.request.body,
          })
          return {
            action: step.action,
            request: step.request,
            hmac: {
              keyId: apiKey.keyId,
              timestampMs,
              signature,
            },
          }
        })
      )
    }

    case SigningMethod.SESSION: {
      for (const step of steps) {
        if (!isSessionStep(step)) {
          throw new PerpsError(
            PerpsErrorCode.SDKError,
            `Ondo received a non-session step ('${step.action}') under the session signing method.`
          )
        }
        switch (step.action) {
          case ActionType.ACCEPT_PROVIDER_TERMS: {
            const token = await deps.tokenStore.get(address)
            if (token === null) {
              throw new OndoSessionExpiredError(
                `No valid Ondo session token stored for ${address}. Run the SIWE login first.`
              )
            }
            await deps.client.post(
              '/v1/agreement',
              {
                termsVersion: ONDO_TERMS_VERSION,
                privacyVersion: ONDO_PRIVACY_VERSION,
              },
              { authToken: token.token }
            )
            break
          }
          case ActionType.REGISTER_API_KEY:
            await ensureApiKey(deps, address)
            break
          default:
            throw new PerpsError(
              PerpsErrorCode.SDKError,
              `Ondo has no session-step executor for action '${step.action}'.`
            )
        }
      }
      return []
    }

    default:
      throw new PerpsError(
        PerpsErrorCode.SDKError,
        `Ondo does not sign via '${method}'. Supported methods: siwe, hmac, session.`
      )
  }
}
