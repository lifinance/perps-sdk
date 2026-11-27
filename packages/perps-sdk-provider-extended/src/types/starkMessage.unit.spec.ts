import type { StarkMessage } from '@lifi/perps-types'
import { describe, expect, it } from 'vitest'
import type {
  ExtendedStarkMessage,
  ExtendedStarkOrderFields,
} from './starkMessage.js'

describe('ExtendedStarkMessage', () => {
  const fields: ExtendedStarkOrderFields = {
    positionId: '430876',
    baseAssetId: '0x1',
    baseAmount: '100',
    quoteAssetId: '0x1',
    quoteAmount: '-5129500',
    feeAssetId: '0x1',
    feeAmount: '1283',
    expiration: '1796216400',
    salt: '1',
  }

  it('fits the StarkMessage of a Stark step', () => {
    const message: ExtendedStarkMessage = {
      type: 'order',
      signaturePath: ['settlement', 'signature'],
      fields,
    }
    const wire: StarkMessage = message

    expect(wire.fields.positionId).toBe('430876')
  })

  it('binds the fields to the message type', () => {
    // @ts-expect-error order fields are not withdrawal fields
    const bad: ExtendedStarkMessage = {
      type: 'withdrawal',
      signaturePath: ['settlement', 'signature'],
      fields,
    }

    expect(bad.type).toBe('withdrawal')
  })
})
