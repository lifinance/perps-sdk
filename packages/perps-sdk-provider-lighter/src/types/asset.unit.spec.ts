import { describe, expectTypeOf, it } from 'vitest'
import type { LtPerpsOrderBookDetail, LtSpotOrderBookDetail } from '../index.js'

describe('Lighter order book detail types', () => {
  it('types the perps mark and index prices as required strings', () => {
    expectTypeOf<
      Pick<LtPerpsOrderBookDetail, 'mark_price' | 'index_price'>
    >().toEqualTypeOf<{ mark_price: string; index_price: string }>()
  })

  it('gives spot rows no mark or index price', () => {
    expectTypeOf<LtSpotOrderBookDetail>().not.toHaveProperty('mark_price')
    expectTypeOf<LtSpotOrderBookDetail>().not.toHaveProperty('index_price')
  })
})
