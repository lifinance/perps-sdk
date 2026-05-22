import { describe, expect, it, vi } from 'vitest'
import {
  createAuthToken,
  isReadOnlyTokenExpiringSoon,
} from './createAuthToken.js'
import type { LighterSigner } from './LighterSigner.js'

describe('createAuthToken', () => {
  it('forwards a 1h deadline + api key context to the signer by default', async () => {
    const fixedNow = 1_700_000_000_000
    const signerStub = {
      createAuthToken: vi.fn(async () => 'token-xyz'),
    } as unknown as LighterSigner

    const token = await createAuthToken({
      signer: signerStub,
      apiKey: {
        apiKeyPrivateKey: '0xpriv',
        apiKeyIndex: 7,
        accountIndex: 42,
      },
      now: () => fixedNow,
    })

    expect(token).toBe('token-xyz')
    expect(
      (signerStub.createAuthToken as ReturnType<typeof vi.fn>).mock.calls[0]
    ).toEqual([
      Math.floor(fixedNow / 1000) + 60 * 60,
      { apiKeyPrivateKey: '0xpriv', apiKeyIndex: 7, accountIndex: 42 },
    ])
  })

  it('honours a custom `lifetimeSeconds`', async () => {
    const fixedNow = 1_700_000_000_000
    const signerStub = {
      createAuthToken: vi.fn(async () => 'tok'),
    } as unknown as LighterSigner

    await createAuthToken({
      signer: signerStub,
      apiKey: {
        apiKeyPrivateKey: '0xpriv',
        apiKeyIndex: 1,
        accountIndex: 2,
      },
      lifetimeSeconds: 7200,
      now: () => fixedNow,
    })

    const [deadline] = (signerStub.createAuthToken as ReturnType<typeof vi.fn>)
      .mock.calls[0]
    expect(deadline).toBe(Math.floor(fixedNow / 1000) + 7200)
  })
})

describe('isReadOnlyTokenExpiringSoon', () => {
  const nowSec = 1_700_000_000
  const now = () => nowSec * 1000

  it('returns false when no token is supplied', () => {
    expect(isReadOnlyTokenExpiringSoon(undefined, 30 * 86_400, now)).toBe(false)
    expect(isReadOnlyTokenExpiringSoon(null, 30 * 86_400, now)).toBe(false)
  })

  it('returns false when the token has already expired', () => {
    const token = {
      token: 'x',
      expiry: nowSec - 60,
      scope: 'all' as const,
      accountIndex: 1,
    }
    expect(isReadOnlyTokenExpiringSoon(token, 30 * 86_400, now)).toBe(false)
  })

  it('returns true when remaining life is within the threshold', () => {
    const token = {
      token: 'x',
      expiry: nowSec + 10 * 86_400,
      scope: 'all' as const,
      accountIndex: 1,
    }
    expect(isReadOnlyTokenExpiringSoon(token, 30 * 86_400, now)).toBe(true)
  })

  it('returns false when remaining life exceeds the threshold', () => {
    const token = {
      token: 'x',
      expiry: nowSec + 60 * 86_400,
      scope: 'all' as const,
      accountIndex: 1,
    }
    expect(isReadOnlyTokenExpiringSoon(token, 30 * 86_400, now)).toBe(false)
  })

  it('defaults the threshold to 30 days when omitted', () => {
    const token = {
      token: 'x',
      expiry: nowSec + 10 * 86_400,
      scope: 'all' as const,
      accountIndex: 1,
    }
    expect(isReadOnlyTokenExpiringSoon(token, undefined, now)).toBe(true)
  })
})
