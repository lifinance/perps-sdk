import { describe, expect, expectTypeOf, it } from 'vitest'
import * as perpsTypes from './index.js'
import type { SetupAgreement } from './providers.js'

describe('@lifi/perps-types runtime surface', () => {
  it('exports no function; runtime helpers belong in @lifi/perps-sdk', () => {
    const functions = Object.entries(perpsTypes)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)

    expect(functions).toEqual([])
  })

  it('exports SetupAgreement', () => {
    expectTypeOf<perpsTypes.SetupAgreement>().toEqualTypeOf<SetupAgreement>()
  })
})
