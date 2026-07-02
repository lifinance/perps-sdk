import { createPerpsClient } from '@lifi/perps-sdk'
import { zeroAddress } from 'viem'
import { afterEach, describe, expect, it } from 'vitest'
import { installInfoFetchMock } from '../../test/mockFetch.js'
import { DEFAULT_HYPERLIQUID_API_URL } from '../constants.js'
import { getAccountExists } from './getAccountExists.js'

const ADDRESS = '0x1234567890123456789012345678901234567890' as const
const client = createPerpsClient({
  integrator: 'test',
  apiKey: 'k',
  retry: false,
})
const ctx = { client, apiUrl: DEFAULT_HYPERLIQUID_API_URL }

describe('getAccountExists', () => {
  let restore: () => void

  afterEach(() => {
    restore?.()
  })

  it('returns false for an unfunded account and posts a zero-address preTransferCheck', async () => {
    let requests: ReturnType<typeof installInfoFetchMock>['requests']
    ;({ restore, requests } = installInfoFetchMock({
      preTransferCheck: { userExists: false, fee: '1.0' },
    }))

    await expect(getAccountExists(ctx, { address: ADDRESS })).resolves.toBe(
      false
    )
    expect(requests).toHaveLength(1)
    expect(requests[0].body).toEqual({
      type: 'preTransferCheck',
      user: ADDRESS,
      source: zeroAddress,
    })
  })

  it('returns true for a funded account', async () => {
    ;({ restore } = installInfoFetchMock({
      preTransferCheck: { userExists: true, fee: '0.0', userHasSentTx: false },
    }))

    await expect(getAccountExists(ctx, { address: ADDRESS })).resolves.toBe(
      true
    )
  })
})
