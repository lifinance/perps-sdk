import { createWalletClient, http, verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import type { OnAuthToken } from '../types/auth.js'
import { OndoApiClient, OndoApiError } from '../utils/apiClient.js'
import { completeSiweLogin } from './completeSiweLogin.js'

const BASE_URL = 'https://api.ondoperps-sandbox.xyz'

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
)
const signer = createWalletClient({
  account,
  chain: mainnet,
  transport: http('http://localhost'),
})

const SIWE_MESSAGE = [
  'ondoperps.xyz wants you to sign in with your Ethereum account:',
  account.address,
  '',
  'Sign in to Ondo Perps',
  '',
  'URI: https://ondoperps.xyz',
  'Version: 1',
  'Chain ID: 1',
  'Nonce: 8ee9befj3',
  'Issued At: 2026-07-03T00:00:00.000Z',
].join('\n')

const AUTH_TOKEN_FIXTURE: OnAuthToken = {
  identifier: account.address.toLowerCase(),
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: 1_750_000_000,
  expirationSecs: 1_750_086_400,
  token: 'ondo-jwt-token',
  newAccount: true,
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('completeSiweLogin', () => {
  it('signs the challenge and exchanges it for an AuthToken plus the signature', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: AUTH_TOKEN_FIXTURE })
      )
    const client = new OndoApiClient(BASE_URL, { fetchImpl })

    const { token, signature } = await completeSiweLogin(client, signer, {
      id: 'challenge-1',
      message: SIWE_MESSAGE,
    })

    expect(token).toEqual(AUTH_TOKEN_FIXTURE)

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE_URL}/v1/auth/erc-4361/login/complete_challenge`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBeNull()

    const body = JSON.parse(init.body as string) as {
      id: string
      signature: `0x${string}`
    }
    expect(body.id).toBe('challenge-1')
    expect(body.signature).toBe(signature)
    await expect(
      verifyMessage({
        address: account.address,
        message: SIWE_MESSAGE,
        signature,
      })
    ).resolves.toBe(true)
  })

  it('propagates an OndoApiError when the venue rejects the signature', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        success: false,
        error: 'invalid signature',
        error_code: 'INVALID_SIGNATURE',
      })
    )
    const client = new OndoApiClient(BASE_URL, { fetchImpl })

    await expect(
      completeSiweLogin(client, signer, {
        id: 'challenge-1',
        message: SIWE_MESSAGE,
      })
    ).rejects.toBeInstanceOf(OndoApiError)
  })
})
