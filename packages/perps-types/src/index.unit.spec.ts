import { describe, expect, it } from 'vitest'
import * as perpsTypes from './index.js'

describe('@lifi/perps-types runtime surface', () => {
  it('exports no function; runtime helpers belong in @lifi/perps-sdk', () => {
    const functions = Object.entries(perpsTypes)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)

    expect(functions).toEqual([])
  })
})
