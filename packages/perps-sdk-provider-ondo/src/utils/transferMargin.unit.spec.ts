import { describe, expect, it } from 'vitest'
import { removableMargin } from './transferMargin.js'

describe('removableMargin', () => {
  it('reports no per-position margin transfer', () => {
    expect(removableMargin()).toBeUndefined()
  })
})
