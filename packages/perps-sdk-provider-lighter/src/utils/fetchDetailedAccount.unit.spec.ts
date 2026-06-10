import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { LIGHTER_CODE_ACCOUNT_NOT_FOUND } from '../constants.js'
import { LighterApiClient } from './apiClient.js'
import { fetchDetailedAccount } from './fetchDetailedAccount.js'

const ADDRESS = '0x1111111111111111111111111111111111111111' as const

const stubFetch =
  (status: number, body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })

const clientWith = (fetchImpl: typeof fetch): LighterApiClient =>
  new LighterApiClient('https://lighter.test', {
    fetchImpl,
    policy: {
      enabled: false,
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      respectRetryAfter: false,
      classify: () => 'fail',
    },
  })

describe('fetchDetailedAccount', () => {
  it('returns the first account on success', async () => {
    const client = clientWith(
      stubFetch(200, { code: 200, accounts: [{ index: 42 }, { index: 7 }] })
    )
    await expect(fetchDetailedAccount(client, ADDRESS)).resolves.toMatchObject({
      index: 42,
    })
  })

  it('throws AccountNotFound for the Lighter account-not-found body code', async () => {
    const client = clientWith(
      stubFetch(400, { code: LIGHTER_CODE_ACCOUNT_NOT_FOUND, message: 'nope' })
    )
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.AccountNotFound,
    })
  })

  it('throws ThirdPartyError on other non-2xx statuses', async () => {
    const client = clientWith(stubFetch(500, { message: 'boom' }))
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.ThirdPartyError,
    })
  })

  it('throws AccountNotFound when the accounts list is empty', async () => {
    const client = clientWith(stubFetch(200, { code: 200, accounts: [] }))
    await expect(fetchDetailedAccount(client, ADDRESS)).rejects.toMatchObject({
      code: PerpsErrorCode.AccountNotFound,
    })
  })
})
