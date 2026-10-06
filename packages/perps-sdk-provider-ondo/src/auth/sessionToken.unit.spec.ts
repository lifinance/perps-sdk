import { createMemoryStorage, PerpsError } from '@lifi/perps-sdk'
import { PerpsErrorCode } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import { ONDO_PROVIDER_KEY } from '../constants.js'
import type { OndoAuthToken } from '../types/auth.js'
import { OndoTokenStore } from './OndoTokenStore.js'
import {
  ondoSessionRequiredError,
  requireOndoSessionToken,
} from './sessionToken.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

const nowSecs = Math.floor(Date.now() / 1000)

const TOKEN: OndoAuthToken = {
  identifier: ADDRESS,
  authType: 'erc4361',
  accountId: 'acct-1',
  issuedAtSecs: nowSecs - 60,
  expirationSecs: nowSecs + 3600,
  token: 'ondo-jwt-token',
}

const makeStore = () =>
  new OndoTokenStore(createMemoryStorage(), 'https://api.ondo.test')

describe('ondoSessionRequiredError', () => {
  it('builds a SetupRequired PerpsError tagged with the Ondo provider key', () => {
    const error = ondoSessionRequiredError('Run the SIWE login first.')

    expect(error).toBeInstanceOf(PerpsError)
    expect(error).toMatchObject({
      code: PerpsErrorCode.SetupRequired,
      message: 'Run the SIWE login first.',
      tool: ONDO_PROVIDER_KEY,
    })
  })
})

describe('requireOndoSessionToken', () => {
  it('returns the stored token', async () => {
    const store = makeStore()
    await store.set(ADDRESS, TOKEN)

    await expect(requireOndoSessionToken(store, ADDRESS)).resolves.toEqual(
      TOKEN
    )
  })

  it('throws SetupRequired when no token is stored', async () => {
    await expect(
      requireOndoSessionToken(makeStore(), ADDRESS)
    ).rejects.toMatchObject({
      code: PerpsErrorCode.SetupRequired,
      message: `No valid Ondo session token stored for ${ADDRESS}. Run the SIWE login first.`,
      tool: ONDO_PROVIDER_KEY,
    })
  })
})
