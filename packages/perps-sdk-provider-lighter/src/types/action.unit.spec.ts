import { describe, expect, it } from 'vitest'
import type { LtWithdrawWasmParams } from './action.js'

// Pure type-level assertions; vitest still picks the file up via the
// `.unit.spec.ts` glob.
describe('LtWithdrawWasmParams', () => {
  it('accepts only amount — the signer owns asset_index and route_type', () => {
    const params: LtWithdrawWasmParams = { amount: 100_000 }
    expect(params.amount).toBe(100_000)

    const withDeclaredFields: LtWithdrawWasmParams = {
      amount: 100_000,
      // @ts-expect-error — asset_index is owned by the signer, not the backend
      asset_index: 3,
      // @ts-expect-error — route_type is owned by the signer, not the backend
      route_type: 0,
    }
    expect(withDeclaredFields.amount).toBe(100_000)
  })
})
